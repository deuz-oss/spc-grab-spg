import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Input, Muted } from '../components/ui';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { EXCEPTION_LABEL, OPS_ROLES } from '../config';
import { programDayKey } from '../utils/period';
import { fmtDayLong, fmtDayShort, fmtTime } from '../utils/format';
import { C, R, SP, T } from '../theme';
import type { ExceptionType, ShiftException } from '../types';

const EXC_ICON: Record<ExceptionType, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  no_show: { icon: 'person-remove-outline', color: C.dangerStrong, bg: C.dangerBg },
  off_site: { icon: 'location-outline', color: C.warnStrong, bg: C.warnBg },
  late: { icon: 'alarm-outline', color: C.warnStrong, bg: C.warnBg },
  short_shift: { icon: 'hourglass-outline', color: C.warnStrong, bg: C.warnBg },
  late_sync: { icon: 'cloud-offline-outline', color: C.infoStrong, bg: C.infoBg },
  kpi_outlier: { icon: 'stats-chart-outline', color: C.purpleStrong, bg: C.purpleBg },
  no_clock_out: { icon: 'log-out-outline', color: C.warnStrong, bg: C.warnBg },
};

/**
 * PIC / back office / Grab: today's roster at a glance, then only what needs a human.
 * One PIC runs every SPG, so routine shifts never appear here — exceptions first, then a
 * one-tap validation queue (spec: "exceptions only").
 */
export default function OpsTodayScreen() {
  const me = useCurrentUser();
  const isOps = !!me && OPS_ROLES.includes(me.role);
  const s = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const today = programDayKey(useNow());

  const todayShifts = useMemo(
    () => s.shifts.filter((x) => x.shiftDate === today && x.status !== 'cancelled' && x.status !== 'replaced'),
    [s.shifts, today],
  );
  const attended = todayShifts.filter((x) => s.attendances.some((a) => a.shiftId === x.id)).length;
  const noShow = todayShifts.filter((x) => x.status === 'no_show').length;
  const waiting = Math.max(0, todayShifts.length - attended - noShow);
  const open = s.exceptions.filter((e) => e.status === 'open').sort((a, b) => b.detectedAt - a.detectedAt);
  const toValidate = s.shifts.filter((x) => x.status === 'done' && !x.validatedAt && !open.some((e) => e.shiftId === x.id));

  const who = (shiftId: string) => {
    const sh = s.shifts.find((x) => x.id === shiftId);
    return {
      name: s.profiles.find((p) => p.id === sh?.spgId)?.name ?? 'SPG',
      venue: s.venues.find((v) => v.id === sh?.venueId)?.name ?? '',
      date: sh?.shiftDate ?? '',
      time: sh ? `${sh.plannedStart.slice(0, 5)}–${sh.plannedEnd.slice(0, 5)}` : '',
    };
  };

  const resolve = async (e: ShiftException, status: 'resolved' | 'waived') => {
    setBusy(`${e.id}-${status}`);
    try {
      await s.resolveException(e.id, status, notes[e.id] ?? '');
      showToast(status === 'resolved' ? 'Exception selesai' : 'Exception dikecualikan');
    } catch (err) {
      showDialog('Belum Tersimpan', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const validate = async (ids: string[]) => {
    setBusy(ids.length > 1 ? 'all' : ids[0]!);
    let ok = 0;
    try {
      for (const id of ids) {
        await s.validateShift(id);
        ok += 1;
      }
      showToast(ok > 1 ? `${ok} shift divalidasi` : 'Shift divalidasi');
    } catch (err) {
      showDialog('Validasi Terhenti', `${ok} berhasil. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep what we have */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View>
        <Text style={T.small}>{fmtDayLong(today)}</Text>
        <Text style={T.h1}>Roster hari ini</Text>
      </View>

      <Card style={{ gap: SP.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SP.sm }}>
          <Text style={[T.metric, { fontSize: 34, lineHeight: 40 }]}>{attended}</Text>
          <Text style={[T.body, { color: C.muted }]}>dari {todayShifts.length} SPG sudah clock-in</Text>
        </View>
        <RosterBar parts={[
          { n: attended, color: C.ok },
          { n: waiting, color: C.borderStrong },
          { n: noShow, color: C.dangerFill },
        ]} />
        <View style={{ flexDirection: 'row', gap: SP.lg, flexWrap: 'wrap' }}>
          <Legend color={C.ok} label="Hadir" n={attended} />
          <Legend color={C.borderStrong} label="Belum masuk" n={waiting} />
          <Legend color={C.dangerFill} label="Tidak hadir" n={noShow} />
        </View>
      </Card>

      <View style={{ gap: SP.sm }}>
        <SectionTitle title={isOps ? 'Perlu tindakan' : 'Exception terbuka'} count={open.length} />
        {open.length === 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingVertical: SP.sm }}>
            <Ionicons name="checkmark-done-circle" size={22} color={C.ok} />
            <Text style={T.body}>Semua shift berjalan normal.</Text>
          </View>
        )}
        {open.map((e) => {
          const w = who(e.shiftId);
          const m = EXC_ICON[e.type];
          return (
            <Card key={e.id} style={{ gap: SP.md }}>
              <View style={{ flexDirection: 'row', gap: SP.md }}>
                <View style={{ width: 44, height: 44, borderRadius: R.input, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={m.icon} size={22} color={m.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[T.badge, { color: m.color }]}>{EXCEPTION_LABEL[e.type]}</Text>
                  <Text style={T.h2}>{w.name}</Text>
                  <Text style={T.small}>{w.venue}, {w.date === today ? 'hari ini' : fmtDayShort(w.date)} {w.time}</Text>
                  <Text style={[T.meta, { marginTop: 2 }]}>{e.detail} (terdeteksi {fmtTime(e.detectedAt)})</Text>
                </View>
              </View>
              {isOps && (
                <>
                  <Input
                    placeholder="Catatan wajib: apa yang dicek dan hasilnya"
                    value={notes[e.id] ?? ''}
                    onChangeText={(t) => setNotes({ ...notes, [e.id]: t })}
                  />
                  <View style={{ flexDirection: 'row', gap: SP.sm }}>
                    <View style={{ flex: 1 }}><Btn title="Selesai" small onPress={() => resolve(e, 'resolved')} loading={busy === `${e.id}-resolved`} /></View>
                    <View style={{ flex: 1 }}><Btn title="Kecualikan" small variant="outline" onPress={() => resolve(e, 'waived')} loading={busy === `${e.id}-waived`} /></View>
                  </View>
                </>
              )}
            </Card>
          );
        })}
        {isOps && open.length > 0 && (
          <Muted>Selesai: masalah sudah ditangani, shift tetap bisa ditagihkan setelah divalidasi. Kecualikan: dicatat, tidak menghalangi validasi.</Muted>
        )}
      </View>

      {isOps && (
        <View style={{ gap: SP.sm }}>
          <SectionTitle title="Siap divalidasi" count={toValidate.length} />
          {toValidate.length === 0 ? (
            <Muted>Shift yang sudah clock-out tanpa exception akan muncul di sini.</Muted>
          ) : (
            <Card style={{ paddingVertical: SP.sm }}>
              {toValidate.map((x, i) => {
                const w = who(x.id);
                return (
                  <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: SP.sm, borderTopWidth: i ? 1 : 0, borderTopColor: C.divider }}>
                    <View style={{ flex: 1 }}>
                      <Text style={T.h3}>{w.name}</Text>
                      <Text style={T.small}>{w.venue}, {fmtDayShort(w.date)}</Text>
                    </View>
                    <Btn title="Validasi" small variant="outline" onPress={() => validate([x.id])} loading={busy === x.id} />
                  </View>
                );
              })}
            </Card>
          )}
          {toValidate.length > 1 && (
            <Btn title={`Validasi semua (${toValidate.length})`} onPress={() => validate(toValidate.map((x) => x.id))} loading={busy === 'all'} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
      <Text style={T.h2}>{title}</Text>
      {count > 0 && (
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[T.badge, { color: C.onPrimary }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

/** Today's roster as one bar: hadir | belum masuk | tidak hadir. */
function RosterBar({ parts }: { parts: { n: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  if (!total) return <View style={{ height: 12, borderRadius: 6, backgroundColor: C.divider }} />;
  return (
    <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, backgroundColor: C.card }}>
      {parts.filter((p) => p.n > 0).map((p, i) => <View key={i} style={{ flex: p.n, backgroundColor: p.color }} />)}
    </View>
  );
}

function Legend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Text style={T.label}>{label} {n}</Text>
    </View>
  );
}
