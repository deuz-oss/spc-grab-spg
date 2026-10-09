import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Btn, Card, Empty, Input, KPICard, ListRow, Muted, SectionHeader } from '../components/ui';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { EXCEPTION_LABEL, OPS_ROLES } from '../config';
import { programDayKey } from '../utils/period';
import { fmtDateTime } from '../utils/format';
import { C, SP } from '../theme';
import type { ShiftException } from '../types';

/**
 * PIC / back office / Grab: today's picture and the exception queue.
 * Only exceptions need a human — routine shifts are validated in one tap once their
 * exceptions are closed (spec: "exceptions only", one PIC for all SPG).
 */
export default function OpsTodayScreen() {
  const me = useCurrentUser();
  const isOps = !!me && OPS_ROLES.includes(me.role);
  const s = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const today = programDayKey(useNow());

  const todayShifts = useMemo(() => s.shifts.filter((x) => x.shiftDate === today && x.status !== 'cancelled'), [s.shifts, today]);
  const clockedIn = todayShifts.filter((x) => s.attendances.some((a) => a.shiftId === x.id)).length;
  const noShow = todayShifts.filter((x) => x.status === 'no_show').length;
  const open = s.exceptions.filter((e) => e.status === 'open').sort((a, b) => b.detectedAt - a.detectedAt);
  const toValidate = s.shifts.filter(
    (x) => x.status === 'done' && !x.validatedAt && !open.some((e) => e.shiftId === x.id),
  );

  const nameOf = (shiftId: string) => {
    const sh = s.shifts.find((x) => x.id === shiftId);
    const spg = s.profiles.find((p) => p.id === sh?.spgId);
    const venue = s.venues.find((v) => v.id === sh?.venueId);
    return { who: spg?.name ?? 'SPG', where: venue?.name ?? '', date: sh?.shiftDate ?? '' };
  };

  const resolve = async (e: ShiftException, status: 'resolved' | 'waived') => {
    try {
      await s.resolveException(e.id, status, notes[e.id] ?? '');
      showToast(status === 'resolved' ? 'Exception diselesaikan' : 'Exception dikecualikan');
    } catch (err) {
      showDialog('Gagal', err instanceof Error ? err.message : String(err));
    }
  };

  const validate = async (shiftId: string) => {
    try {
      await s.validateShift(shiftId);
      showToast('Shift divalidasi');
    } catch (err) {
      showDialog('Gagal', err instanceof Error ? err.message : String(err));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep what we have */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionHeader title="Hari ini" subtitle={today} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.lg }}>
        <KPICard title="Shift terjadwal" value={String(todayShifts.length)} />
        <KPICard title="Sudah clock-in" value={String(clockedIn)} />
        <KPICard title="Tidak hadir" value={String(noShow)} />
        <KPICard title="Exception terbuka" value={String(open.length)} />
      </View>

      <SectionHeader title="Exception terbuka" level="card" />
      {open.length === 0 && <Empty text="Tidak ada exception terbuka." icon="checkmark-done-outline" />}
      {open.map((e) => {
        const n = nameOf(e.shiftId);
        return (
          <Card key={e.id} style={{ marginBottom: SP.sm }}>
            <ListRow
              title={`${EXCEPTION_LABEL[e.type]} · ${n.who}`}
              subtitle={`${n.where} · ${n.date}`}
              meta={`${e.detail} · ${fmtDateTime(e.detectedAt)}`}
              emphasis={{ color: e.type === 'no_show' ? C.accent : C.warn, label: EXCEPTION_LABEL[e.type] }}
              numberOfLines={2}
            />
            {isOps && (
              <View style={{ marginTop: SP.sm, gap: SP.sm }}>
                <Input
                  placeholder="Catatan (wajib): apa yang dicek dan hasilnya"
                  value={notes[e.id] ?? ''}
                  onChangeText={(t) => setNotes({ ...notes, [e.id]: t })}
                />
                <View style={{ flexDirection: 'row', gap: SP.sm }}>
                  <Btn title="Selesai" small variant="ok" onPress={() => resolve(e, 'resolved')} />
                  <Btn title="Kecualikan" small variant="outline" onPress={() => resolve(e, 'waived')} />
                </View>
              </View>
            )}
          </Card>
        );
      })}

      {isOps && (
        <>
          <SectionHeader title="Siap divalidasi" subtitle="Shift selesai tanpa exception terbuka" level="card" />
          {toValidate.length === 0 && <Muted>Belum ada.</Muted>}
          {toValidate.map((x) => {
            const n = nameOf(x.id);
            return (
              <ListRow
                key={x.id}
                title={n.who}
                subtitle={`${n.where} · ${n.date}`}
                trailing={<Btn title="Validasi" small onPress={() => validate(x.id)} />}
              />
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
