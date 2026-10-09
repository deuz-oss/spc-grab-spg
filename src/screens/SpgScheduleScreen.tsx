import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Card, Empty, ListRow, Muted, SectionHeader } from '../components/ui';
import { useCurrentUser, useStore } from '../store/useStore';
import { useNow } from '../components/useNow';
import { programDayKey } from '../utils/period';
import { C, SP } from '../theme';
import type { Shift } from '../types';

const STATUS: Record<Shift['status'], { label: string; color: string }> = {
  planned: { label: 'Terjadwal', color: C.info },
  done: { label: 'Selesai', color: C.ok },
  no_show: { label: 'Tidak hadir', color: C.accent },
  replaced: { label: 'Diganti', color: C.muted },
  cancelled: { label: 'Dibatalkan', color: C.muted },
};

/** SPG / coordinator: upcoming shifts and the last two weeks, so they know where to be (R3). */
export default function SpgScheduleScreen() {
  const me = useCurrentUser();
  const s = useStore();
  const today = programDayKey(useNow());
  const [refreshing, setRefreshing] = useState(false);

  const mine = useMemo(() => s.shifts.filter((x) => x.spgId === me?.id), [s.shifts, me?.id]);
  const upcoming = mine.filter((x) => x.shiftDate >= today && x.status !== 'cancelled' && x.status !== 'replaced')
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.plannedStart.localeCompare(b.plannedStart));
  const past = mine.filter((x) => x.shiftDate < today).sort((a, b) => b.shiftDate.localeCompare(a.shiftDate)).slice(0, 14);

  const row = (x: Shift) => {
    const v = s.venues.find((y) => y.id === x.venueId);
    const r = s.requests.find((y) => y.id === x.requestId);
    const c = s.campaigns.find((y) => y.id === r?.campaignId);
    const st = STATUS[x.status];
    return (
      <ListRow
        key={x.id}
        title={`${x.shiftDate === today ? 'Hari ini' : x.shiftDate} · ${x.plannedStart.slice(0, 5)}–${x.plannedEnd.slice(0, 5)}`}
        subtitle={`${v?.name ?? 'Venue'}${v?.address ? ` · ${v.address}` : ''}`}
        meta={`${c?.name ?? ''}${x.overtimeHours ? ` · termasuk ${x.overtimeHours} jam lembur` : ''}`}
        emphasis={{ color: st.color, label: st.label }}
        numberOfLines={2}
      />
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* offline: keep the snapshot */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionHeader title="Jadwal saya" subtitle="Shift yang akan datang" />
      {upcoming.length === 0 ? (
        <Empty text="Belum ada jadwal. PIC SPC akan mengabari bila ada penugasan." icon="calendar-outline" />
      ) : (
        <Card style={{ marginBottom: SP.lg }}>{upcoming.map(row)}</Card>
      )}
      {past.length > 0 && (
        <>
          <SectionHeader title="Riwayat 2 minggu" level="card" />
          <Card>{past.map(row)}</Card>
        </>
      )}
      <Muted style={{ marginTop: SP.md }}>Datang 15 menit sebelum jam mulai. Clock-in hanya bisa di lokasi venue.</Muted>
    </ScrollView>
  );
}
