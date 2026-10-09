import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Badge, Btn, Card, Empty, Field, Input, Muted, SectionHeader, StatusBadge } from '../components/ui';
import { EvidencePhotoField } from '../components/EvidencePhotoField';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { venueFence } from '../utils/geo';
import { programDayKey } from '../utils/period';
import { fmtTime } from '../utils/format';
import { C, SP, T } from '../theme';
import type { Attendance, Campaign, Shift, Venue } from '../types';

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
    showDialog('Clock-out?', 'Pastikan semua KPI hari ini sudah dicatat.', [
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

  const running = attendance && !attendance.clockOutAt;
  return (
    <Card style={{ marginBottom: SP.md }}>
      <Text style={T.h2}>{venue?.name ?? 'Venue'}</Text>
      <Muted>
        {shift.plannedStart.slice(0, 5)}–{shift.plannedEnd.slice(0, 5)} · {campaign?.name ?? ''}
        {shift.overtimeHours ? ` · termasuk ${shift.overtimeHours} jam lembur` : ''}
      </Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginTop: SP.sm }}>
        {attendance?.pending && <Badge label="Menunggu sinyal" color={C.warn} />}
        {attendance?.geoValid === false && <StatusBadge label="Di luar lokasi" color={C.warn} icon="warning-outline" />}
        {attendance?.geoValid === true && <StatusBadge label="Di lokasi" color={C.ok} icon="checkmark-circle-outline" />}
        {!!attendance?.lateMin && attendance.lateMin > 0 && <Badge label={`Terlambat ${attendance.lateMin} mnt`} color={C.warn} />}
        {shift.status === 'no_show' && <StatusBadge label="Tidak hadir" color={C.accent} icon="close-circle-outline" />}
      </View>
      {!attendance && shift.status === 'planned' && (
        <View style={{ marginTop: SP.md }}>
          <Btn title="Clock-in dengan Selfie" onPress={doClockIn} loading={busy} />
        </View>
      )}
      {attendance && (
        <Muted style={{ marginTop: SP.sm }}>
          Masuk {fmtTime(attendance.clockInAt)}
          {attendance.clockOutAt ? ` · Keluar ${fmtTime(attendance.clockOutAt)}` : ''}
        </Muted>
      )}
      {running && campaign && <KpiForm shift={shift} campaign={campaign} />}
      {running && (
        <View style={{ marginTop: SP.md }}>
          <Btn title="Clock-out" variant="outline" onPress={doClockOut} />
        </View>
      )}
    </Card>
  );
}

function KpiForm({ shift, campaign }: { shift: Shift; campaign: Campaign }) {
  const logs = useStore((s) => s.kpiLogs.filter((k) => k.shiftId === shift.id));
  const submitKpi = useStore((s) => s.submitKpi);
  const [values, setValues] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, string | null>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const save = async (key: string, proofRequired: boolean) => {
    const value = Number(values[key]);
    if (!Number.isFinite(value) || value < 0) return showDialog('Angka Tidak Valid', 'Isi angka 0 atau lebih.');
    if (proofRequired && !proofs[key]) return showDialog('Foto Bukti Wajib', 'Ambil foto bukti. Jangan memotret data pribadi pelanggan.');
    setBusyKey(key);
    try {
      await submitKpi(shift.id, key, value, proofs[key] ?? undefined);
      showToast('KPI tersimpan');
    } catch (e) {
      showDialog('Gagal Menyimpan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={{ marginTop: SP.md }}>
      <SectionHeader title="KPI shift ini" level="card" />
      {campaign.kpiFields.map((f) => {
        const done = logs.find((l) => l.fieldKey === f.key);
        if (done) {
          return (
            <Muted key={f.key} style={{ marginBottom: SP.xs }}>
              {f.label}: {done.value} {f.unit}
              {done.pending ? ' (menunggu sinyal)' : ' ✓'}
            </Muted>
          );
        }
        return (
          <View key={f.key} style={{ marginBottom: SP.md }}>
            <Field label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`} required>
              <Input keyboardType="number-pad" value={values[f.key] ?? ''} onChangeText={(t) => setValues({ ...values, [f.key]: t })} />
            </Field>
            {f.proof_required && (
              <EvidencePhotoField
                uri={proofs[f.key] ?? null}
                onChange={(u) => setProofs({ ...proofs, [f.key]: u })}
                tips={['Bukti angka terlihat jelas', 'Tanpa nama, nomor HP, atau wajah pelanggan']}
              />
            )}
            <Btn title={`Simpan ${f.label}`} small onPress={() => save(f.key, f.proof_required)} loading={busyKey === f.key} />
          </View>
        );
      })}
    </View>
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
  const upcoming = useMemo(
    () => shifts.filter((s) => s.spgId === me?.id && s.shiftDate > today && s.status === 'planned')
      .sort((a, b) => (a.shiftDate + a.plannedStart).localeCompare(b.shiftDate + b.plannedStart)).slice(0, 7),
    [shifts, me?.id, today],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } catch { /* offline: keep what we have */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionHeader title={`Halo, ${me?.name?.split(' ')[0] ?? ''}`} subtitle="Shift hari ini" />
      {mine.length === 0 && <Empty text="Tidak ada shift hari ini." icon="calendar-outline" />}
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
      {upcoming.length > 0 && (
        <>
          <SectionHeader title="Jadwal berikutnya" level="card" />
          {upcoming.map((s) => (
            <Text key={s.id} style={[T.body, { marginBottom: SP.xs }]}>
              {s.shiftDate} · {s.plannedStart.slice(0, 5)} · {venues.find((v) => v.id === s.venueId)?.name ?? ''}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}
