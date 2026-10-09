import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Badge, Card, Empty, ErrorState, ListRow, Muted, SectionHeader } from '../components/ui';
import { LeafletMap, type MapMarker } from '../components/LeafletMap';
import { useStore } from '../store/useStore';
import { agoLabel, liveState, type LiveState } from '../utils/live';
import { haversineM } from '../utils/geo';
import { programDayKey } from '../utils/period';
import { wibClock } from '../utils/exports';
import { C, SP } from '../theme';
import type { LivePosition } from '../types';

/** SPG positions move every 15–30 s; a glance every minute is enough for the PIC and Grab. */
const POLL_MS = 60 * 1000;

const STATE: Record<LiveState, { label: string; color: string }> = {
  in_store: { label: 'Di venue', color: C.ok },
  on_the_road: { label: 'Di luar venue', color: C.warn },
  stale: { label: 'Tidak ada update', color: C.muted },
};

/**
 * Live map (R8): every clocked-in SPG at the last known position, against their venue's geofence.
 * live_positions() returns names only — no phone numbers — so the same view serves Grab.
 */
export default function LiveMapScreen() {
  const s = useStore();
  const fetchLivePositions = useStore((x) => x.fetchLivePositions);
  const [positions, setPositions] = useState<LivePosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setPositions(await fetchLivePositions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNow(Date.now());
    }
  }, [fetchLivePositions]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(load, POLL_MS);
      return () => clearInterval(t);
    }, [load]),
  );

  const today = programDayKey(now);
  const rows = (positions ?? []).map((p) => {
    const v = s.venues.find((x) => x.id === p.venueId);
    const inside = !!v && haversineM(v, p) <= v.radiusM;
    return { p, v, state: liveState(p.at, inside, now) };
  }).sort((a, b) => a.p.name.localeCompare(b.p.name));

  const venuesToday = s.venues.filter((v) =>
    s.shifts.some((x) => x.venueId === v.id && x.shiftDate === today && x.status !== 'cancelled' && x.status !== 'replaced'));
  const markers: MapMarker[] = [
    ...venuesToday.map((v) => ({ lat: v.lat, lng: v.lng, label: `Venue: ${v.name}`, color: C.primaryDark })),
    ...rows.map(({ p, v, state }) => ({
      lat: p.lat, lng: p.lng, color: STATE[state].color,
      label: `${p.name} · ${v?.name ?? ''} · ${STATE[state].label} · ${agoLabel(p.at, now)}`,
    })),
  ];
  const scheduledToday = s.shifts.filter((x) => x.shiftDate === today && x.status === 'planned'
    && !s.attendances.some((a) => a.shiftId === x.id) && !rows.some((r) => r.p.shiftId === x.id)).length;

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }}>
      <SectionHeader title="Peta live" subtitle={`SPG yang sedang shift · diperbarui ${wibClock(now)} WIB`} />
      {error && <ErrorState text={error} onRetry={load} />}
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: SP.md }}>
        <LeafletMap markers={markers} height={340} zoom={12} />
      </Card>
      <View style={{ flexDirection: 'row', gap: SP.sm, flexWrap: 'wrap', marginBottom: SP.md }}>
        {(Object.keys(STATE) as LiveState[]).map((k) => (
          <Badge key={k} label={`${STATE[k].label}: ${rows.filter((r) => r.state === k).length}`} color={STATE[k].color} />
        ))}
        <Badge label={`Belum clock-in: ${scheduledToday}`} color={C.info} />
      </View>
      {positions && rows.length === 0 && <Empty text="Belum ada SPG yang clock-in." icon="location-outline" />}
      {rows.map(({ p, v, state }) => (
        <ListRow
          key={p.shiftId}
          title={p.name}
          subtitle={`${v?.name ?? 'Venue'} · ${agoLabel(p.at, now)}`}
          emphasis={{ color: STATE[state].color, label: STATE[state].label }}
        />
      ))}
      <Muted style={{ marginTop: SP.md }}>
        Posisi dikirim HP SPG selama shift. Status “Tidak ada update” berarti lebih dari 15 menit tanpa data — HP mati, GPS dimatikan, atau tanpa sinyal.
      </Muted>
    </ScrollView>
  );
}
