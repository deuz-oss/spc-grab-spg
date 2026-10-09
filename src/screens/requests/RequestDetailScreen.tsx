import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Badge, Btn, Card, Chip, Empty, Field, Input, ListRow, Muted, SectionHeader } from '../../components/ui';
import { SpgAvatar } from '../../components/pickers';
import { showDialog, showToast } from '../../components/dialog';
import { useCurrentUser, useStore } from '../../store/useStore';
import { useNow } from '../../components/useNow';
import { candidates, coverage, defaultTimes, hiringSla, INELIGIBLE_LABEL, isLive, isTime, whyNot } from '../../utils/roster';
import { programDayKey } from '../../utils/period';
import { fmtDateTime } from '../../utils/format';
import { OPS_ROLES } from '../../config';
import { C, SP, T } from '../../theme';
import type { Profile, Replacement, Shift } from '../../types';
import type { RequestsStackParams } from './types';
import { PACKAGE_LABEL, REPLACEMENT_REASON, REQUEST_STATUS, SLA_META } from './labels';

type Props = NativeStackScreenProps<RequestsStackParams, 'RequestDetail'>;

const SHIFT_STATUS: Record<Shift['status'], { label: string; color: string }> = {
  planned: { label: 'Terjadwal', color: C.info },
  done: { label: 'Selesai', color: C.ok },
  no_show: { label: 'Tidak hadir', color: C.accent },
  replaced: { label: 'Diganti', color: C.muted },
  cancelled: { label: 'Dibatalkan', color: C.muted },
};

/**
 * One request: details, hiring SLA, roster per date (name, grade, photo — what Grab confirms one
 * day before start, R3), open replacements (R7), and for the PIC the scheduling panel (R5 gates
 * shown up front; the server enforces them again).
 */
export default function RequestDetailScreen({ route, navigation }: Props) {
  const me = useCurrentUser();
  const s = useStore();
  const now = useNow();
  const today = programDayKey(now);
  const isOps = !!me && OPS_ROLES.includes(me.role);
  const req = s.requests.find((r) => r.id === route.params.id);

  const [pickDates, setPickDates] = useState<string[]>([]);
  const [spgId, setSpgId] = useState<string | null>(null);
  const [times, setTimes] = useState(() => defaultTimes(req?.shiftHours ?? 8));
  const [replacing, setReplacing] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false);

  const cov = useMemo(() => (req ? coverage(req, s.shifts) : []), [req, s.shifts]);
  if (!req) return <Empty text="Request tidak ditemukan." icon="alert-circle-outline" />;

  const camp = s.campaigns.find((c) => c.id === req.campaignId);
  const city = s.cities.find((c) => c.id === req.cityId);
  const venue = s.venues.find((v) => v.id === req.venueId);
  const st = REQUEST_STATUS[req.status];
  const sla = SLA_META[hiringSla(req, now)];
  const shifts = s.shifts.filter((x) => x.requestId === req.id);
  const openRepl = s.replacements.filter((r) => !r.filledAt && shifts.some((x) => x.id === r.originalShiftId));
  const profileOf = (id: string) => s.profiles.find((p) => p.id === id);
  const editable = isOps && req.status !== 'cancelled' && req.status !== 'closed';
  const gapDates = cov.filter((d) => d.scheduled < d.needed && d.date >= today).map((d) => d.date);
  const dates = replacing ? [replacing.shiftDate] : pickDates;

  const startReplacement = (shift: Shift) => {
    setReplacing(shift);
    setSpgId(null);
    setTimes({ start: shift.plannedStart.slice(0, 5), end: shift.plannedEnd.slice(0, 5) });
  };

  const schedule = async () => {
    if (!spgId) return showDialog('Pilih SPG', 'Pilih SPG yang dijadwalkan.');
    if (!dates.length) return showDialog('Pilih Tanggal', 'Pilih minimal satu tanggal.');
    if (!isTime(times.start) || !isTime(times.end) || times.end <= times.start) {
      return showDialog('Jam Tidak Valid', 'Isi jam mulai dan selesai (JJ:MM), selesai setelah mulai.');
    }
    const p = profileOf(spgId)!;
    const blocked = dates.map((d) => ({ d, why: whyNot(p, req, d, s.trainings, s.shifts) })).filter((x) => x.why);
    if (blocked.length) {
      return showDialog('Tidak Bisa Dijadwalkan', blocked.map((b) => `${b.d}: ${INELIGIBLE_LABEL[b.why!]}`).join('\n'));
    }
    setBusy(true);
    try {
      await s.scheduleShifts(req.id, spgId, dates, times.start, times.end, replacing?.id ?? null);
      showToast(replacing ? 'Pengganti dijadwalkan' : `${dates.length} shift dijadwalkan`);
      setPickDates([]);
      setSpgId(null);
      setReplacing(null);
    } catch (e) {
      showDialog('Gagal Menjadwalkan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const shiftMenu = (x: Shift) => {
    const worked = s.attendances.some((a) => a.shiftId === x.id);
    const buttons = [];
    if (x.status === 'planned' && !worked) {
      buttons.push({ label: 'Batalkan shift', destructive: true, onPress: () => run(() => s.cancelShift(x.id), 'Shift dibatalkan') });
    }
    if (x.status === 'planned' || x.status === 'no_show') {
      (['resignation', 'underperform'] as Replacement['reason'][]).forEach((reason) =>
        buttons.push({
          label: `Ganti: ${REPLACEMENT_REASON[reason]}`,
          onPress: () => run(() => s.openReplacement(x.id, reason), 'Penggantian dibuka — SLA berjalan'),
        }),
      );
    }
    if (!buttons.length) return;
    showDialog(`${profileOf(x.spgId)?.name ?? 'SPG'} · ${x.shiftDate}`, 'Pilih tindakan', [...buttons, { label: 'Tutup' }]);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      showDialog('Gagal', e instanceof Error ? e.message : String(e));
    }
  };

  const cancelRequest = () =>
    showDialog('Batalkan Request?', 'Semua shift yang belum berjalan ikut dibatalkan.', [
      { label: 'Tidak' },
      { label: 'Batalkan Request', destructive: true, onPress: () => run(async () => { await s.cancelRequest(req.id); navigation.goBack(); }, 'Request dibatalkan') },
    ]);

  const pool: Profile[] = candidates(s.profiles, req);

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={camp?.name ?? 'Request'} subtitle={`${city?.name ?? ''} · ${venue?.name ?? ''}`} />
      <Card style={{ marginBottom: SP.md, gap: SP.xs }}>
        <View style={{ flexDirection: 'row', gap: SP.sm, flexWrap: 'wrap' }}>
          <Badge label={st.label} color={st.color} />
          <Badge label={`SLA hiring ${sla.label}`} color={sla.color} />
        </View>
        <Text style={T.body}>{req.startDate} s/d {req.endDate} · {req.headcount} SPG/hari · grade {req.grade}</Text>
        <Muted>{req.shiftHours} jam{req.shiftHours === 10 ? ' (8 normal + 2 lembur)' : ''} · {PACKAGE_LABEL[req.package]}</Muted>
        <Muted>Masuk {fmtDateTime(req.submittedAt)} · batas SLA {fmtDateTime(req.slaHiringDue)}{req.staffedAt ? ` · terisi ${fmtDateTime(req.staffedAt)}` : ''}</Muted>
        {venue?.address ? <Muted>{venue.address}</Muted> : null}
        {req.notes ? <Muted>Catatan: {req.notes}</Muted> : null}
      </Card>

      {openRepl.length > 0 && (
        <>
          <SectionHeader title="Penggantian terbuka" subtitle="SLA 1 hari kerja (kota Strong) / 2 hari (Weak)" level="card" />
          {openRepl.map((r) => {
            const orig = s.shifts.find((x) => x.id === r.originalShiftId)!;
            const late = now > r.dueAt;
            return (
              <Card key={r.id} style={{ marginBottom: SP.sm }}>
                <ListRow
                  title={`${profileOf(orig.spgId)?.name ?? 'SPG'} · ${orig.shiftDate}`}
                  subtitle={`${REPLACEMENT_REASON[r.reason]} · batas ${fmtDateTime(r.dueAt)}`}
                  emphasis={{ color: late ? C.accent : C.warn, label: late ? 'Lewat SLA' : 'Belum diisi' }}
                  trailing={editable ? <Btn title="Isi pengganti" small onPress={() => startReplacement(orig)} /> : undefined}
                />
              </Card>
            );
          })}
        </>
      )}

      <SectionHeader title="Roster" subtitle="Nama, grade dan foto SPG per tanggal" level="card" />
      {cov.map((d) => {
        const day = shifts.filter((x) => x.shiftDate === d.date && x.status !== 'cancelled')
          .sort((a, b) => Number(isLive(b)) - Number(isLive(a)));
        const noShows = day.filter((x) => x.status === 'no_show').length;
        const short = d.scheduled - noShows < d.needed;
        return (
          <Card key={d.date} style={{ marginBottom: SP.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={T.label}>{d.date === today ? `Hari ini · ${d.date}` : d.date}</Text>
              <Badge label={`${d.scheduled}/${d.needed}${noShows ? ` · ${noShows} tidak hadir` : ''}`} color={short ? C.warn : C.ok} />
            </View>
            {day.length === 0 && <Muted>Belum ada SPG.</Muted>}
            {day.map((x) => {
              const p = profileOf(x.spgId);
              const ss = SHIFT_STATUS[x.status];
              return (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: SP.sm }}>
                  <SpgAvatar name={p?.name ?? '?'} path={p?.photoPath ?? null} />
                  <View style={{ flex: 1 }}>
                    <ListRow
                      title={`${p?.name ?? 'SPG'}${p?.grade ? ` · Grade ${p.grade}` : ''}`}
                      subtitle={`${x.plannedStart.slice(0, 5)}–${x.plannedEnd.slice(0, 5)}${x.replacesShiftId ? ' · pengganti' : ''}`}
                      emphasis={{ color: ss.color, label: ss.label }}
                      onPress={editable ? () => shiftMenu(x) : undefined}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        );
      })}

      {editable && (
        <Card style={{ marginTop: SP.md, gap: SP.sm }}>
          <SectionHeader
            title={replacing ? `Pengganti untuk ${replacing.shiftDate}` : 'Jadwalkan SPG'}
            subtitle={replacing ? `Menggantikan ${profileOf(replacing.spgId)?.name ?? 'SPG'}` : 'Grade dan training dicek sebelum disimpan'}
            level="card"
          />
          {!replacing && (
            <Field label="Tanggal">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs }}>
                {cov.filter((d) => d.date >= today).map((d) => (
                  <Chip
                    key={d.date}
                    label={`${d.date.slice(5)} (${d.scheduled}/${d.needed})`}
                    active={pickDates.includes(d.date)}
                    onPress={() => setPickDates(pickDates.includes(d.date) ? pickDates.filter((x) => x !== d.date) : [...pickDates, d.date])}
                  />
                ))}
              </View>
              {gapDates.length > 0 && (
                <View style={{ flexDirection: 'row', gap: SP.xs, marginTop: SP.xs }}>
                  <Btn title={`Pilih ${gapDates.length} tanggal yang kurang`} small variant="outline" onPress={() => setPickDates(gapDates)} />
                  {pickDates.length > 0 && <Btn title="Kosongkan" small variant="outline" onPress={() => setPickDates([])} />}
                </View>
              )}
            </Field>
          )}
          <View style={{ flexDirection: 'row', gap: SP.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Mulai"><Input value={times.start} onChangeText={(v) => setTimes({ ...times, start: v })} maxLength={5} /></Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Selesai"><Input value={times.end} onChangeText={(v) => setTimes({ ...times, end: v })} maxLength={5} /></Field>
            </View>
          </View>
          <Field label="SPG">
            {pool.length === 0 && <Muted>Belum ada SPG. Tambahkan di menu Data → SPG.</Muted>}
            {pool.map((p) => {
              const why = dates.map((d) => whyNot(p, req, d, s.trainings, s.shifts)).find(Boolean) ?? null;
              const cityName = s.cities.find((c) => c.id === p.cityId)?.name ?? '';
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, marginTop: SP.xs }}>
                  <SpgAvatar name={p.name} path={p.photoPath} size={36} />
                  <View style={{ flex: 1 }}>
                    <ListRow
                      title={`${p.name} · Grade ${p.grade ?? '-'}`}
                      subtitle={why ? `Tidak bisa: ${INELIGIBLE_LABEL[why]}` : cityName}
                      selected={spgId === p.id}
                      onPress={why ? undefined : () => setSpgId(p.id)}
                    />
                  </View>
                </View>
              );
            })}
          </Field>
          <Btn title={replacing ? 'Jadwalkan Pengganti' : `Jadwalkan ${dates.length || ''} Shift`} onPress={schedule} loading={busy} />
          {replacing && <Btn title="Batal" variant="outline" onPress={() => setReplacing(null)} />}
        </Card>
      )}

      {editable && (
        <View style={{ marginTop: SP.lg }}>
          <Btn title="Batalkan Request" variant="danger" onPress={cancelRequest} />
        </View>
      )}
      <View style={{ height: SP.xl }} />
    </ScrollView>
  );
}
