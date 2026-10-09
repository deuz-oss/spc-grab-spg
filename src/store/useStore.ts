import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Json, TablesUpdate } from '../lib/database.types';
import type {
  Attendance, Campaign, City, DailyReport, GrabRequest, KpiField, KpiLog, LivePosition, Profile, Replacement, Role,
  Shift, ShiftException, Training, Venue,
} from '../types';
import { loadQueue, saveQueue, type QueuedOp } from '../utils/offlineQueue';
import { deleteSnapshot, getLastUser, loadSnapshot, saveSnapshot, setLastUser } from '../utils/offlineCache';
import { discardLocalPhoto, localPhotoExists, persistPhotoLocally, uploadPhoto } from '../utils/storage';
import { KPI_PROOF_BUCKET, PROFILE_PHOTO_BUCKET, SELFIE_BUCKET } from '../utils/photoRef';
import { uid } from '../utils/uuid';
import type { ExportData } from '../utils/exports';
import { drainQueue, isNetworkError, queueReason, settle, type ReplayResult } from './replay';
import {
  mapAttendance, mapCampaign, mapCity, mapDailyReport, mapException, mapKpi, mapLivePosition, mapProfile, mapReplacement,
  mapRequest, mapShift, mapTraining, mapVenue,
} from './mappers';
import { CONSENT_VERSION, FIELD_ROLES, HISTORY_DAYS, MONITOR_ROLES } from '../config';

/** Username in the UI, synthetic e-mail in Supabase Auth (same scheme as the reference app). */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@internal.spc`;

type Pos = { lat: number; lng: number; mocked: boolean };

export interface NewRequest {
  campaignId: string; cityId: string; venueId: string; grade: GrabRequest['grade']; headcount: number;
  startDate: string; endDate: string; shiftHours: 8 | 10; package: GrabRequest['package']; notes: string;
}
export interface VenueInput { id?: string; cityId: string; name: string; address: string; lat: number; lng: number; radiusM: number }
export interface CampaignInput { id?: string; name: string; type: Campaign['type']; kpiFields: KpiField[]; startsOn: string; endsOn: string | null; active: boolean }
export interface NewAccount {
  username: string; password: string; name: string; role: Role; cityId?: string | null;
  grade?: Profile['grade']; contractType?: Profile['contractType']; phone?: string | null;
}
export type ProfilePatch = Partial<Pick<Profile, 'name' | 'cityId' | 'grade' | 'contractType' | 'documentsOk' | 'phoneOk' | 'bpjsRegistered'>>;

export interface StoreState {
  ready: boolean;
  me: Profile | null;
  profiles: Profile[];
  cities: City[];
  venues: Venue[];
  campaigns: Campaign[];
  requests: GrabRequest[];
  shifts: Shift[];
  attendances: Attendance[];
  kpiLogs: KpiLog[];
  exceptions: ShiftException[];
  trainings: Training[];
  replacements: Replacement[];
  dailyReports: DailyReport[];
  queue: QueuedOp[];
  syncing: boolean;
  /** Set while running from the on-device snapshot (no server reachable at start). */
  offlineSnapshotAt: number | null;
  lastSyncAt: number | null;

  init(): Promise<void>;
  signIn(username: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
  clockIn(shiftId: string, pos: Pos, selfieUri: string): Promise<void>;
  clockOut(attendanceId: string, pos: Pos): Promise<void>;
  submitKpi(shiftId: string, fieldKey: string, value: number, proofUri?: string): Promise<void>;
  syncQueue(): Promise<{ synced: number; failed: QueuedOp[] }>;
  validateShift(shiftId: string): Promise<void>;
  resolveException(id: number, status: 'resolved' | 'waived', note: string): Promise<void>;
  publishDailyReport(date: string): Promise<void>;
  giveConsent(): Promise<void>;
  createRequest(r: NewRequest): Promise<string>;
  cancelRequest(id: string): Promise<void>;
  scheduleShifts(requestId: string, spgId: string, dates: string[], start: string, end: string, replacesShiftId?: string | null): Promise<void>;
  cancelShift(shiftId: string): Promise<void>;
  openReplacement(shiftId: string, reason: Replacement['reason']): Promise<void>;
  recordTraining(spgId: string, campaignId: string, score: number | null): Promise<void>;
  saveVenue(v: VenueInput): Promise<void>;
  saveCampaign(c: CampaignInput): Promise<void>;
  updateProfile(id: string, patch: ProfilePatch): Promise<void>;
  setProfilePhoto(id: string, uri: string): Promise<void>;
  createAccount(a: NewAccount): Promise<void>;
  setPassword(userId: string, password: string): Promise<void>;
  setActive(userId: string, active: boolean): Promise<void>;
  fetchLivePositions(): Promise<LivePosition[]>;
  fetchPhones(): Promise<Record<string, string>>;
  fetchExportData(from: string, to: string): Promise<ExportData>;
}

async function online(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return s.isConnected !== false && s.isInternetReachable !== false;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const useStore = create<StoreState>((set, get) => {
  const persistQueue = async (queue: QueuedOp[]) => {
    set({ queue });
    const me = get().me;
    if (me) await saveQueue(me.id, queue);
  };
  const enqueue = (op: QueuedOp) => persistQueue([...get().queue, op]);

  const snapshot = async () => {
    const s = get();
    if (!s.me) return;
    await saveSnapshot(s.me.id, {
      savedAt: Date.now(),
      historyFrom: Date.now() - HISTORY_DAYS * 86400000,
      data: {
        profiles: [s.me], cities: s.cities, venues: s.venues, campaigns: s.campaigns,
        requests: s.requests, shifts: s.shifts, attendances: s.attendances, kpiLogs: s.kpiLogs,
      },
    });
  };

  async function loadAll(userId: string): Promise<void> {
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000);
    const sinceDate = since.toISOString().slice(0, 10);
    const meRow = await supabase.from('profiles').select('*').eq('id', userId).single();
    fail(meRow.error);
    const role = (meRow.data as { role: Role }).role;
    const monitor = MONITOR_ROLES.includes(role);
    const none = Promise.resolve({ data: [] as Record<string, unknown>[], error: null });
    const [me, profiles, cities, venues, campaigns, requests, shifts, atts, kpis, excs, trs, reps, reports] = await Promise.all([
      Promise.resolve(meRow),
      // Staff need inactive accounts too (to reactivate them); RLS still scopes who sees whom.
      monitor ? supabase.from('profiles').select('*').order('name') : supabase.from('profiles').select('*').eq('active', true),
      supabase.from('cities').select('*').order('name'),
      supabase.from('venues').select('*'),
      supabase.from('campaigns').select('*'),
      supabase.from('requests').select('*').gte('end_date', sinceDate),
      supabase.from('shifts').select('*').gte('shift_date', sinceDate),
      supabase.from('attendances').select('*').gte('clock_in_at', since.toISOString()),
      supabase.from('kpi_logs').select('*').gte('logged_at', since.toISOString()),
      supabase.from('exceptions').select('*').or(`status.eq.open,detected_at.gte.${since.toISOString()}`),
      supabase.from('trainings').select('*'),
      monitor ? supabase.from('replacements').select('*').gte('requested_at', since.toISOString()) : none,
      monitor ? supabase.from('daily_reports').select('*').gte('report_date', sinceDate).order('report_date', { ascending: false }) : none,
    ]);
    for (const r of [me, profiles, cities, venues, campaigns, requests, shifts, atts, kpis, excs, trs, reps, reports]) fail(r.error);
    const queue = get().queue;
    // Rows still in the offline queue are not on the server yet: keep their optimistic copies.
    const pendingAtt = get().attendances.filter((a) => a.pending);
    const pendingKpi = get().kpiLogs.filter((k) => k.pending);
    const routes = new Map(get().attendances.map((a) => [a.id, a.route]));
    set({
      me: mapProfile(me.data!),
      profiles: (profiles.data ?? []).map(mapProfile),
      cities: (cities.data ?? []).map(mapCity),
      venues: (venues.data ?? []).map(mapVenue),
      campaigns: (campaigns.data ?? []).map(mapCampaign),
      requests: (requests.data ?? []).map(mapRequest),
      shifts: (shifts.data ?? []).map(mapShift),
      attendances: [
        ...(atts.data ?? []).map((r) => ({ ...mapAttendance(r), route: routes.get(r.id) ?? [] })),
        ...pendingAtt.filter((p) => !(atts.data ?? []).some((r) => r.id === p.id)),
      ],
      kpiLogs: [...(kpis.data ?? []).map(mapKpi), ...pendingKpi.filter((p) => !(kpis.data ?? []).some((r) => r.id === p.id))],
      exceptions: (excs.data ?? []).map(mapException),
      trainings: (trs.data ?? []).map(mapTraining),
      replacements: (reps.data ?? []).map(mapReplacement),
      dailyReports: (reports.data ?? []).map(mapDailyReport),
      offlineSnapshotAt: null,
      lastSyncAt: Date.now(),
      queue,
    });
    void snapshot();
  }

  async function replay(op: QueuedOp): Promise<ReplayResult> {
    const me = get().me!;
    switch (op.type) {
      case 'clockIn': {
        if (!(await localPhotoExists(op.localSelfieUri))) return 'dropped';
        let path: string;
        try {
          path = await uploadPhoto(SELFIE_BUCKET, me.id, op.attendance.id, op.localSelfieUri);
        } catch {
          return 'retry';
        }
        const a = op.attendance;
        const { error } = await supabase.from('attendances').insert({
          id: a.id, shift_id: a.shiftId, user_id: a.userId, clock_in_at: new Date(a.clockInAt).toISOString(),
          clock_in_lat: a.clockInLat, clock_in_lng: a.clockInLng, mocked: a.mocked,
        });
        const r = settle(error);
        if (r !== 'done') return r;
        const media = await supabase.from('attendance_media').insert({ attendance_id: a.id, selfie_in_path: path });
        if (media.error && settle(media.error) === 'retry') return 'retry';
        await discardLocalPhoto(op.localSelfieUri);
        return 'done';
      }
      case 'clockOut': {
        const { error } = await supabase.from('attendances')
          .update({ clock_out_at: new Date(op.clockOutAt).toISOString(), clock_out_lat: op.lat, clock_out_lng: op.lng })
          .eq('id', op.attendanceId);
        return settle(error);
      }
      case 'submitKpi': {
        const k = op.log;
        let proof: string | null = null;
        if (op.localProofUri) {
          if (!(await localPhotoExists(op.localProofUri))) return 'dropped';
          try {
            proof = await uploadPhoto(KPI_PROOF_BUCKET, me.id, k.id, op.localProofUri);
          } catch {
            return 'retry';
          }
        }
        const { error } = await supabase.from('kpi_logs').insert({
          id: k.id, shift_id: k.shiftId, spg_id: k.spgId, field_key: k.fieldKey, value: k.value,
          proof_path: proof, logged_at: new Date(k.loggedAt).toISOString(),
        });
        const r = settle(error);
        if (r === 'done' && op.localProofUri) await discardLocalPhoto(op.localProofUri);
        return r;
      }
    }
  }

  /** Sends now when possible, else queues behind earlier ops (order is kept). */
  async function runOrQueue(op: QueuedOp): Promise<'sent' | 'queued'> {
    const reason = queueReason(await online(), get().queue.length);
    if (!reason) {
      const r = await replay(op);
      if (r === 'done') return 'sent';
      if (r === 'failed') throw new Error('Server menolak data ini. Periksa jadwal dan coba lagi.');
      if (r === 'dropped') throw new Error('Foto tidak ditemukan di HP. Ambil ulang fotonya.');
    }
    await enqueue(op);
    return 'queued';
  }

  const reload = async () => {
    const me = get().me;
    if (me) await loadAll(me.id);
  };

  return {
    ready: false, me: null, profiles: [], cities: [], venues: [], campaigns: [], requests: [], shifts: [],
    attendances: [], kpiLogs: [], exceptions: [], trainings: [], replacements: [], dailyReports: [], queue: [], syncing: false, offlineSnapshotAt: null, lastSyncAt: null,

    async init() {
      const { data, error } = await supabase.auth.getSession();
      let userId = data.session?.user.id ?? null;
      if (error || !userId) userId = (await online()) ? null : await getLastUser();
      if (!userId) return set({ ready: true });
      set({ queue: await loadQueue(userId) });
      try {
        await loadAll(userId);
        void get().syncQueue();
      } catch {
        // No server: open from the last snapshot instead of signing the user out.
        const snap = await loadSnapshot(userId);
        if (snap) {
          const d = snap.data as Record<string, never[]>;
          set({
            me: (d.profiles?.[0] as Profile | undefined) ?? null, cities: d.cities ?? [], venues: d.venues ?? [],
            campaigns: d.campaigns ?? [], requests: d.requests ?? [], shifts: d.shifts ?? [],
            attendances: d.attendances ?? [], kpiLogs: d.kpiLogs ?? [], offlineSnapshotAt: snap.savedAt,
          });
        }
      }
      set({ ready: true });
    },

    async signIn(username, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (error || !data.user) return isNetworkError(error) ? 'Tidak ada koneksi internet.' : 'Username atau password salah.';
      try {
        set({ queue: await loadQueue(data.user.id) });
        await loadAll(data.user.id);
      } catch (e) {
        await supabase.auth.signOut();
        return e instanceof Error ? e.message : 'Gagal memuat data.';
      }
      if (!get().me?.active) {
        await supabase.auth.signOut();
        set({ me: null });
        return 'Akun belum diaktifkan. Hubungi PIC SPC.';
      }
      await setLastUser(data.user.id);
      void get().syncQueue();
      return null;
    },

    async signOut() {
      const me = get().me;
      await supabase.auth.signOut();
      if (me) await deleteSnapshot(me.id); // the queue stays: it replays when this user signs in again
      await setLastUser(null);
      set({
        me: null, profiles: [], requests: [], shifts: [], attendances: [], kpiLogs: [], exceptions: [],
        trainings: [], replacements: [], dailyReports: [], queue: [], offlineSnapshotAt: null,
      });
    },

    async refresh() {
      const me = get().me;
      if (!me) return;
      await get().syncQueue();
      await loadAll(me.id);
    },

    async clockIn(shiftId, pos, selfieUri) {
      const me = get().me!;
      if (get().attendances.some((a) => a.shiftId === shiftId)) throw new Error('Shift ini sudah clock-in.');
      const attendance: Attendance = {
        id: `a_${uid()}`, shiftId, userId: me.id, clockInAt: Date.now(), clockInLat: pos.lat, clockInLng: pos.lng,
        mocked: pos.mocked, geoValid: null, distanceM: null, lateMin: null, clockOutAt: null, autoClosed: false,
        route: [{ lat: pos.lat, lng: pos.lng, t: Date.now() }], pending: true,
      };
      // Native: copy the photo somewhere the OS will not evict before the queue uploads it.
      const localSelfieUri = Platform.OS === 'web' ? selfieUri : await persistPhotoLocally(selfieUri);
      set({ attendances: [...get().attendances, attendance] });
      try {
        const how = await runOrQueue({ id: uid(), type: 'clockIn', attendance, localSelfieUri });
        if (how === 'sent') await loadAll(me.id); // pick up server-computed geofence, lateness, exceptions
      } catch (e) {
        set({ attendances: get().attendances.filter((a) => a.id !== attendance.id) });
        throw e;
      }
    },

    async clockOut(attendanceId, pos) {
      const me = get().me!;
      const at = Date.now();
      set({ attendances: get().attendances.map((a) => (a.id === attendanceId ? { ...a, clockOutAt: at } : a)) });
      try {
        const how = await runOrQueue({ id: uid(), type: 'clockOut', attendanceId, clockOutAt: at, lat: pos.lat, lng: pos.lng });
        if (how === 'sent') await loadAll(me.id);
      } catch (e) {
        set({ attendances: get().attendances.map((a) => (a.id === attendanceId ? { ...a, clockOutAt: null } : a)) });
        throw e;
      }
    },

    async submitKpi(shiftId, fieldKey, value, proofUri) {
      const me = get().me!;
      const log: KpiLog = {
        id: `k_${uid()}`, shiftId, spgId: me.id, fieldKey, value, proofPath: null, loggedAt: Date.now(), pending: true,
      };
      const localProofUri = proofUri && Platform.OS !== 'web' ? await persistPhotoLocally(proofUri) : proofUri;
      set({ kpiLogs: [...get().kpiLogs, log] });
      try {
        const how = await runOrQueue({ id: uid(), type: 'submitKpi', log, localProofUri });
        if (how === 'sent') set({ kpiLogs: get().kpiLogs.map((k) => (k.id === log.id ? { ...k, pending: false } : k)) });
      } catch (e) {
        set({ kpiLogs: get().kpiLogs.filter((k) => k.id !== log.id) });
        throw e;
      }
    },

    async syncQueue() {
      const me = get().me;
      if (!me || get().syncing || !get().queue.length || !(await online())) return { synced: 0, failed: [] };
      set({ syncing: true });
      try {
        const result = await drainQueue({
          head: () => get().queue[0],
          replay,
          remove: (op) => persistQueue(get().queue.filter((q) => q.id !== op.id)),
          stillValid: () => get().me?.id === me.id,
        });
        if (result.synced || result.failed.length) await loadAll(me.id);
        return result;
      } finally {
        set({ syncing: false });
      }
    },

    async validateShift(shiftId) {
      fail((await supabase.rpc('validate_shift', { p_shift: shiftId })).error);
      await loadAll(get().me!.id);
    },

    async resolveException(id, status, note) {
      fail((await supabase.rpc('resolve_exception', { p_id: id, p_status: status, p_note: note })).error);
      await loadAll(get().me!.id);
    },

    async publishDailyReport(date) {
      fail((await supabase.rpc('publish_daily_report', { p_date: date })).error);
      await reload();
    },

    async giveConsent() {
      const me = get().me!;
      // The server stamps consent_at itself (profiles_guard_update, migration 0006).
      fail((await supabase.from('profiles').update({ consent_version: CONSENT_VERSION }).eq('id', me.id)).error);
      await reload();
    },

    async createRequest(r) {
      const id = `r_${uid()}`;
      fail((await supabase.from('requests').insert({
        id, campaign_id: r.campaignId, city_id: r.cityId, venue_id: r.venueId, grade: r.grade, headcount: r.headcount,
        start_date: r.startDate, end_date: r.endDate, shift_hours: r.shiftHours, package: r.package, notes: r.notes,
      })).error);
      await reload();
      return id;
    },

    async cancelRequest(id) {
      fail((await supabase.from('requests').update({ status: 'cancelled' }).eq('id', id)).error);
      const live = get().shifts.filter((x) => x.requestId === id && x.status === 'planned').map((x) => x.id);
      if (live.length) fail((await supabase.from('shifts').update({ status: 'cancelled' }).in('id', live)).error);
      await reload();
    },

    async scheduleShifts(requestId, spgId, dates, start, end, replacesShiftId) {
      const req = get().requests.find((x) => x.id === requestId);
      if (!req) throw new Error('Request tidak ditemukan.');
      const rows = dates.map((d) => ({
        id: `s_${uid()}`, request_id: requestId, venue_id: req.venueId, spg_id: spgId, shift_date: d,
        planned_start: start, planned_end: end, replaces_shift_id: replacesShiftId ?? null,
      }));
      fail((await supabase.from('shifts').insert(rows)).error);
      await reload();
    },

    async cancelShift(shiftId) {
      fail((await supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shiftId).eq('status', 'planned')).error);
      await reload();
    },

    async openReplacement(shiftId, reason) {
      fail((await supabase.rpc('open_replacement', { p_shift: shiftId, p_reason: reason })).error);
      await reload();
    },

    async recordTraining(spgId, campaignId, score) {
      const me = get().me!;
      fail((await supabase.from('trainings').insert({
        id: `t_${uid()}`, spg_id: spgId, campaign_id: campaignId, score, recorded_by: me.id,
      })).error);
      await reload();
    },

    async saveVenue(v) {
      const row = { city_id: v.cityId, name: v.name, address: v.address, lat: v.lat, lng: v.lng, radius_m: v.radiusM };
      if (v.id) fail((await supabase.from('venues').update(row).eq('id', v.id)).error);
      else fail((await supabase.from('venues').insert({ id: `v_${uid()}`, created_by: get().me!.id, ...row })).error);
      await reload();
    },

    async saveCampaign(c) {
      const row = { name: c.name, type: c.type, kpi_fields: c.kpiFields as unknown as Json, ends_on: c.endsOn, active: c.active };
      if (c.id) fail((await supabase.from('campaigns').update(row).eq('id', c.id)).error);
      else fail((await supabase.from('campaigns').insert({ id: `c_${uid()}`, starts_on: c.startsOn, ...row })).error);
      await reload();
    },

    async updateProfile(id, patch) {
      const row: TablesUpdate<'profiles'> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.cityId !== undefined) row.city_id = patch.cityId;
      if (patch.grade !== undefined) row.grade = patch.grade;
      if (patch.contractType !== undefined) row.contract_type = patch.contractType;
      if (patch.documentsOk !== undefined) row.documents_ok = patch.documentsOk;
      if (patch.phoneOk !== undefined) row.phone_ok = patch.phoneOk;
      if (patch.bpjsRegistered !== undefined) row.bpjs_registered = patch.bpjsRegistered;
      fail((await supabase.from('profiles').update(row).eq('id', id)).error);
      await reload();
    },

    async setProfilePhoto(id, uri) {
      const path = await uploadPhoto(PROFILE_PHOTO_BUCKET, id, `photo_${uid()}`, uri);
      fail((await supabase.from('profiles').update({ photo_path: path }).eq('id', id)).error);
      await reload();
    },

    async createAccount(a) {
      await adminUsers({ action: 'create', ...a });
      await reload();
    },

    async setPassword(userId, password) {
      await adminUsers({ action: 'setPassword', userId, password });
    },

    async setActive(userId, active) {
      await adminUsers({ action: 'setActive', userId, active });
      await reload();
    },

    async fetchLivePositions() {
      const { data, error } = await supabase.rpc('live_positions');
      fail(error);
      return ((data ?? []) as Record<string, unknown>[]).map(mapLivePosition);
    },

    async fetchExportData(from, to) {
      // Exports may reach past the 45 days loaded at login, so they read the range from the server.
      const sh = await supabase.from('shifts').select('*').gte('shift_date', from).lte('shift_date', to);
      fail(sh.error);
      const shifts = (sh.data ?? []).map(mapShift);
      const ids = shifts.map((x) => x.id);
      const reqIds = [...new Set(shifts.map((x) => x.requestId))];
      const chunk = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 200) }, (_, i) => a.slice(i * 200, i * 200 + 200));
      const atts: Record<string, unknown>[] = [];
      const kpis: Record<string, unknown>[] = [];
      const excs: Record<string, unknown>[] = [];
      for (const part of chunk(ids)) {
        const [a, k, e] = await Promise.all([
          supabase.from('attendances').select('*').in('shift_id', part),
          supabase.from('kpi_logs').select('*').in('shift_id', part),
          supabase.from('exceptions').select('*').in('shift_id', part),
        ]);
        fail(a.error); fail(k.error); fail(e.error);
        atts.push(...(a.data ?? [])); kpis.push(...(k.data ?? [])); excs.push(...(e.data ?? []));
      }
      const reqs = reqIds.length ? await supabase.from('requests').select('*').in('id', reqIds) : { data: [], error: null };
      fail(reqs.error);
      const st = get();
      return {
        shifts, requests: (reqs.data ?? []).map(mapRequest),
        attendances: atts.map((r) => ({ ...mapAttendance(r), route: [] })), kpiLogs: kpis.map(mapKpi), exceptions: excs.map(mapException),
        profiles: st.profiles, venues: st.venues, cities: st.cities, campaigns: st.campaigns,
      };
    },

    async fetchPhones() {
      const { data, error } = await supabase.from('profile_contacts').select('user_id, phone');
      fail(error);
      return Object.fromEntries(((data ?? []) as { user_id: string; phone: string }[]).map((r) => [r.user_id, r.phone]));
    },
  };
});

export const useCurrentUser = () => useStore((s) => s.me);

/** Field workers must agree to the current consent text before using the app (R16). */
export const needsConsent = (me: Profile | null) => !!me && FIELD_ROLES.includes(me.role) && me.consentVersion !== CONSENT_VERSION;

/** Calls the admin-users edge function; surfaces its Indonesian error message, not the HTTP status. */
async function adminUsers(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message || 'Gagal menghubungi server.';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch { /* keep the generic message */ }
    }
    throw new Error(msg);
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data;
}
