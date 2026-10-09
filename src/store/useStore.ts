import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { HISTORY_DAYS } from '../config';
import type {
  Attendance, Campaign, City, GrabRequest, KpiLog, Profile, Shift, ShiftException, Venue,
} from '../types';
import { loadQueue, saveQueue, type QueuedOp } from '../utils/offlineQueue';
import { deleteSnapshot, getLastUser, loadSnapshot, saveSnapshot, setLastUser } from '../utils/offlineCache';
import { discardLocalPhoto, localPhotoExists, persistPhotoLocally, uploadPhoto } from '../utils/storage';
import { KPI_PROOF_BUCKET, SELFIE_BUCKET } from '../utils/photoRef';
import { uid } from '../utils/uuid';
import { drainQueue, isNetworkError, queueReason, settle, type ReplayResult } from './replay';
import {
  mapAttendance, mapCampaign, mapCity, mapException, mapKpi, mapProfile, mapRequest, mapShift, mapVenue,
} from './mappers';

/** Username in the UI, synthetic e-mail in Supabase Auth (same scheme as the reference app). */
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@internal.spc`;

type Pos = { lat: number; lng: number; mocked: boolean };

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
    const [me, profiles, cities, venues, campaigns, requests, shifts, atts, kpis, excs] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('profiles').select('*').eq('active', true),
      supabase.from('cities').select('*').order('name'),
      supabase.from('venues').select('*'),
      supabase.from('campaigns').select('*'),
      supabase.from('requests').select('*').gte('end_date', sinceDate),
      supabase.from('shifts').select('*').gte('shift_date', sinceDate),
      supabase.from('attendances').select('*').gte('clock_in_at', since.toISOString()),
      supabase.from('kpi_logs').select('*').gte('logged_at', since.toISOString()),
      supabase.from('exceptions').select('*').or(`status.eq.open,detected_at.gte.${since.toISOString()}`),
    ]);
    for (const r of [me, profiles, cities, venues, campaigns, requests, shifts, atts, kpis, excs]) fail(r.error);
    const queue = get().queue;
    // Rows still in the offline queue are not on the server yet: keep their optimistic copies.
    const pendingAtt = get().attendances.filter((a) => a.pending);
    const pendingKpi = get().kpiLogs.filter((k) => k.pending);
    const routes = new Map(get().attendances.map((a) => [a.id, a.route]));
    set({
      me: mapProfile(me.data),
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

  return {
    ready: false, me: null, profiles: [], cities: [], venues: [], campaigns: [], requests: [], shifts: [],
    attendances: [], kpiLogs: [], exceptions: [], queue: [], syncing: false, offlineSnapshotAt: null, lastSyncAt: null,

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
        queue: [], offlineSnapshotAt: null,
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
    },
  };
});

export const useCurrentUser = () => useStore((s) => s.me);
