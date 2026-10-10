import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Btn, Card, Empty } from '../components/ui';
import { EvidencePhotoField } from '../components/EvidencePhotoField';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { venueFence } from '../utils/geo';
import { programDayKey } from '../utils/period';
import { fmtDayLong, fmtDayShort, fmtDurShort, fmtTime } from '../utils/format';
import { C, ELEV, F, SP, T, TOUCH } from '../theme';
import type { Attendance, Campaign, KpiField, Shift, Venue } from '../types';

async function currentPosition(): Promise<{ lat: number; lng: number; mocked: boolean } | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    showDialog('Izin Lokasi Diperlukan', 'Clock-in membutuhkan lokasi HP. Izinkan lokasi untuk aplikasi ini di Pengaturan.');
    return null;
  }
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude, mocked: !!p.mocked };
}

async function takeSelfie(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    showDialog('Izin Kamera Diperlukan', 'Selfie absensi harus diambil langsung dengan kamera.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ quality: 0.4, cameraType: ImagePicker.CameraType.front });
  return !res.canceled && res.assets[0] ? res.assets[0].uri : null;
}

type PassState = 'upcoming' | 'running' | 'done' | 'missed';

const PASS_STATE: Record<PassState, { label: string; bg: string; fg: string }> = {
  upcoming: { label: 'Belum clock-in', bg: 'rgba(255,255,255,0.14)', fg: C.onDark },
  running: { label: 'Sedang bertugas', bg: C.gold, fg: C.onGold },
  done: { label: 'Selesai', bg: 'rgba(255,255,255,0.14)', fg: C.onDark },
  missed: { label: 'Tidak hadir', bg: C.dangerFill, fg: C.onPrimary },
};

function ShiftCard({ shift, venue, campaign, attendance }: { shift: Shift; venue?: Venue; campaign?: Campaign; attendance?: Attendance }) {
  const clockIn = useStore((s) => s.clockIn);
  const clockOut = useStore((s) => s.clockOut);
  const [busy, setBusy] = useState(false);

  const doClockIn = async () => {
    if (!venue) return;
    setBusy(true);
    try {
      const pos = await currentPosition();
      if (!pos) return;
      const fence = venueFence(venue, pos, pos.mocked);
      const proceed = async () => {
        const selfie = await takeSelfie();
        if (!selfie) return;
        await clockIn(shift.id, pos, selfie);
        showToast('Clock-in tercatat');
      };
      if (pos.mocked) {
        showDialog('Lokasi Palsu Terdeteksi', 'Matikan aplikasi pengubah lokasi lalu coba lagi.');
      } else if (!fence.inside) {
        showDialog(
          'Di Luar Lokasi',
          `Anda ${fence.distanceM} m dari ${venue.name} (batas ${venue.radiusM} m). Clock-in tetap bisa, tapi akan ditandai dan dicek PIC.`,
          [{ label: 'Batal' }, { label: 'Tetap Clock-in', onPress: () => void proceed().catch((e) => showDialog('Gagal', String(e.message ?? e))) }],
        );
      } else {
        await proceed();
      }
    } catch (e) {
      showDialog('Gagal Clock-in', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doClockOut = async () => {
    if (!attendance) return;
    showDialog('Clock-out sekarang?', 'Pastikan semua KPI hari ini sudah tersimpan.', [
      { label: 'Batal' },
      {
        label: 'Clock-out',
        onPress: async () => {
          try {
            const pos = (await currentPosition()) ?? { lat: attendance.clockInLat, lng: attendance.clockInLng, mocked: false };
            await clockOut(attendance.id, pos);
            showToast('Clock-out tercatat');
          } catch (e) {
            showDialog('Gagal Clock-out', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const running = !!attendance && !attendance.clockOutAt;
  const finished = !!attendance?.clockOutAt;
  const state: PassState = shift.status === 'no_show' ? 'missed' : finished ? 'done' : running ? 'running' : 'upcoming';

  return (
    <View style={{ marginBottom: SP.xl }}>
      <ShiftPass shift={shift} venue={venue} campaign={campaign} state={state} attendance={attendance}>
        {state === 'upcoming' && (
          <>
            <Btn title="Clock-in dengan selfie" variant="hivis" onPress={doClockIn} loading={busy} />
            <Text style={[T.meta, { color: C.onDarkMuted, marginTop: SP.sm, textAlign: 'center' }]}>
              Berdiri dalam {venue?.radiusM ?? 150} m dari titik venue. Kamera depan akan terbuka.
            </Text>
          </>
        )}
        {state === 'running' && attendance && <RunningStrip attendance={attendance} />}
        {state === 'done' && attendance?.clockOutAt && (
          <Text style={[T.status, { color: C.onDark }]}>
            Masuk {fmtTime(attendance.clockInAt)}, keluar {fmtTime(attendance.clockOutAt)} — {fmtDurShort(attendance.clockOutAt - attendance.clockInAt)} bertugas
          </Text>
        )}
        {state === 'missed' && (
          <Text style={[T.status, { color: C.onDark }]}>Tercatat tidak hadir. Hubungi PIC bila ada kendala.</Text>
        )}
      </ShiftPass>
      {running && campaign && <KpiForm shift={shift} campaign={campaign} />}
      {running && (
        <View style={{ marginTop: SP.md }}>
          <Btn title="Clock-out" variant="outline" onPress={doClockOut} />
        </View>
      )}
    </View>
  );
}

/**
 * The shift as a work pass: times first and large (what an SPG checks on the way in), then where,
 * then a perforated tear line above the one action that matters right now.
 */
function ShiftPass({
  shift, venue, campaign, state, attendance, children,
}: { shift: Shift; venue?: Venue; campaign?: Campaign; state: PassState; attendance?: Attendance; children: React.ReactNode }) {
  const st = PASS_STATE[state];
  const dim = state === 'done' || state === 'missed';
  return (
    <View style={{ backgroundColor: dim ? '#33475A' : C.primary, borderRadius: 20, overflow: 'hidden', ...ELEV[2] }}>
      {state === 'running' && <View style={{ height: 6, backgroundColor: C.gold }} />}
      <View style={{ padding: SP.lg, paddingBottom: SP.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[T.label, { color: C.onDarkMuted }]}>{fmtDayShort(shift.shiftDate)}</Text>
          <View style={{ backgroundColor: st.bg, borderRadius: 999, paddingHorizontal: SP.md, paddingVertical: 4 }}>
            <Text style={[T.badge, { color: st.fg }]}>{st.label}</Text>
          </View>
        </View>
        <Text
          style={[T.clock, { marginTop: SP.sm }]}
          accessibilityLabel={`Jam ${shift.plannedStart.slice(0, 5)} sampai ${shift.plannedEnd.slice(0, 5)}`}
        >
          {shift.plannedStart.slice(0, 5)}
          <Text style={{ color: C.onDarkFaint }}> – </Text>
          {shift.plannedEnd.slice(0, 5)}
        </Text>
        <Text style={[T.h1, { color: C.onDark, marginTop: SP.sm }]}>{venue?.name ?? 'Venue'}</Text>
        {venue?.address ? <Text style={[T.small, { color: C.onDarkMuted }]}>{venue.address}</Text> : null}
        <View style={{ gap: 6, marginTop: SP.md }}>
          {campaign && <PassTag icon="megaphone-outline" label={campaign.name} />}
          {shift.overtimeHours > 0 && <PassTag icon="time-outline" label={`Termasuk ${shift.overtimeHours} jam lembur`} />}
          {attendance?.pending && <PassTag icon="cloud-offline-outline" label="Menunggu sinyal — terkirim otomatis" warn />}
          {attendance?.geoValid === true && <PassTag icon="checkmark-circle-outline" label="Clock-in di lokasi" />}
          {attendance?.geoValid === false && <PassTag icon="warning-outline" label="Clock-in di luar lokasi — dicek PIC" warn />}
          {!!attendance?.lateMin && attendance.lateMin > 0 && <PassTag icon="alarm-outline" label={`Terlambat ${attendance.lateMin} menit`} warn />}
        </View>
      </View>
      <Perforation />
      <View style={{ padding: SP.lg, paddingTop: SP.md }}>{children}</View>
    </View>
  );
}

function PassTag({ icon, label, warn }: { icon: keyof typeof Ionicons.glyphMap; label: string; warn?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
      <Ionicons name={icon} size={16} color={warn ? C.gold : C.onDarkMuted} />
      <Text style={[T.label, { color: warn ? C.gold : C.onDarkMuted, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

/** Tear line with notches cut into both edges, in the page colour. */
function Perforation() {
  return (
    <View style={{ height: 20, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.bg }} />
      <View style={{ position: 'absolute', right: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: C.bg }} />
      <View style={{ marginHorizontal: SP.lg, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.28)' }} />
    </View>
  );
}

function RunningStrip({ attendance }: { attendance: Attendance }) {
  const now = useNow(30000);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View>
        <Text style={[T.meta, { color: C.onDarkMuted }]}>Sudah bertugas</Text>
        <Text style={[T.timer, { color: C.gold }]}>{fmtDurShort(now - attendance.clockInAt)}</Text>
      </View>
      <Text style={[T.label, { color: C.onDarkMuted, marginBottom: 6 }]}>Masuk {fmtTime(attendance.clockInAt)}</Text>
    </View>
  );
}

/** KPI of this shift: one counter per campaign field, tapped up during the shift and saved once. */
function KpiForm({ shift, campaign }: { shift: Shift; campaign: Campaign }) {
  // Select the array itself: a selector that builds a new array each call loops zustand forever.
  const allLogs = useStore((s) => s.kpiLogs);
  const logs = useMemo(() => allLogs.filter((k) => k.shiftId === shift.id), [allLogs, shift.id]);
  const done = campaign.kpiFields.filter((f) => logs.some((l) => l.fieldKey === f.key)).length;
  return (
    <Card style={{ marginTop: SP.md, gap: SP.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={T.h2}>KPI shift ini</Text>
        <Text style={[T.label, { color: C.muted }]}>{done} dari {campaign.kpiFields.length} tersimpan</Text>
      </View>
      {campaign.kpiFields.map((f) => {
        const saved = logs.find((l) => l.fieldKey === f.key);
        return saved ? (
          <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingVertical: SP.xs }}>
            <Ionicons name={saved.pending ? 'cloud-upload-outline' : 'checkmark-circle'} size={22} color={saved.pending ? C.warn : C.ok} />
            <Text style={[T.body, { flex: 1 }]}>{f.label}</Text>
            <Text style={[T.metric, { fontSize: 20, lineHeight: 24 }]}>{saved.value}</Text>
            <Text style={T.meta}>{f.unit}</Text>
          </View>
        ) : (
          <KpiCounter key={f.key} shift={shift} field={f} />
        );
      })}
    </Card>
  );
}

function KpiCounter({ shift, field }: { shift: Shift; field: KpiField }) {
  const submitKpi = useStore((s) => s.submitKpi);
  const [value, setValue] = useState(0);
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (field.proof_required && !proof) return showDialog('Foto Bukti Wajib', 'Ambil foto bukti. Jangan memotret data pribadi pelanggan.');
    setBusy(true);
    try {
      await submitKpi(shift.id, field.key, value, proof ?? undefined);
      showToast(`${field.label}: ${value} tersimpan`);
    } catch (e) {
      showDialog('Gagal Menyimpan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const step = (d: number) => setValue((v) => Math.max(0, v + d));
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.divider, paddingTop: SP.md, gap: SP.sm }}>
      <Text style={T.label}>{field.label}{field.unit ? <Text style={{ color: C.muted, fontFamily: F.reg }}> ({field.unit})</Text> : null}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
        <StepButton icon="remove" label={`Kurangi ${field.label}`} onPress={() => step(-1)} />
        <TextInput
          value={String(value)}
          onChangeText={(t) => setValue(Math.max(0, Number(t.replace(/\D/g, '')) || 0))}
          keyboardType="number-pad"
          accessibilityLabel={`Jumlah ${field.label}`}
          style={[T.metric, { flex: 1, minWidth: 0, width: 0, textAlign: 'center', fontSize: 34, lineHeight: 40, minHeight: TOUCH }]}
        />
        <StepButton icon="add" label={`Tambah ${field.label}`} onPress={() => step(1)} strong />
      </View>
      {field.proof_required && (
        <EvidencePhotoField uri={proof} onChange={setProof} tips={['Angka bukti terlihat jelas', 'Tanpa nama, nomor HP, atau wajah pelanggan']} />
      )}
      <Btn title={`Simpan ${field.label}`} small onPress={save} loading={busy} />
    </View>
  );
}

function StepButton({ icon, label, onPress, strong }: { icon: 'add' | 'remove'; label: string; onPress: () => void; strong?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
      style={{
        width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: strong ? C.gold : C.divider,
      }}
    >
      <Ionicons name={icon} size={28} color={strong ? C.onGold : C.text} />
    </TouchableOpacity>
  );
}

export default function SpgTodayScreen() {
  const me = useCurrentUser();
  const { shifts, venues, campaigns, requests, attendances, refresh } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const today = programDayKey(useNow());
  const mine = useMemo(
    () => shifts.filter((s) => s.spgId === me?.id && s.shiftDate === today && s.status !== 'cancelled' && s.status !== 'replaced')
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)),
    [shifts, me?.id, today],
  );
  const next = useMemo(
    () => shifts.filter((s) => s.spgId === me?.id && s.shiftDate > today && s.status === 'planned')
      .sort((a, b) => (a.shiftDate + a.plannedStart).localeCompare(b.shiftDate + b.plannedStart))[0],
    [shifts, me?.id, today],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } catch { /* offline: keep what we have */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={T.small}>{fmtDayLong(today)}</Text>
      <Text style={[T.h1, { marginBottom: SP.lg }]}>Halo, {me?.name?.split(' ')[0] ?? ''}</Text>
      {mine.length === 0 && (
        <Empty
          text={next ? 'Tidak ada shift hari ini. Shift berikutnya ada di bawah.' : 'Tidak ada shift hari ini. PIC akan mengabari bila ada penugasan.'}
          icon="cafe-outline"
        />
      )}
      {mine.map((s) => {
        const req = requests.find((r) => r.id === s.requestId);
        return (
          <ShiftCard
            key={s.id}
            shift={s}
            venue={venues.find((v) => v.id === s.venueId)}
            campaign={campaigns.find((c) => c.id === req?.campaignId)}
            attendance={attendances.find((a) => a.shiftId === s.id)}
          />
        );
      })}
      {next && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
          <View style={{ width: 52, alignItems: 'center' }}>
            <Text style={[T.meta, { color: C.muted }]}>{fmtDayShort(next.shiftDate).split(' ')[0]}</Text>
            <Text style={[T.metric, { fontSize: 24, lineHeight: 28 }]}>{Number(next.shiftDate.slice(8))}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.meta}>Shift berikutnya</Text>
            <Text style={T.h3}>{venues.find((v) => v.id === next.venueId)?.name ?? 'Venue'}</Text>
            <Text style={T.small}>{next.plannedStart.slice(0, 5)} – {next.plannedEnd.slice(0, 5)}</Text>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
