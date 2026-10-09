import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Badge, Btn, Card, Chip, Empty, ListRow, Muted, SectionHeader } from '../../components/ui';
import { useCurrentUser, useStore } from '../../store/useStore';
import { useNow } from '../../components/useNow';
import { coverage, hiringSla } from '../../utils/roster';
import { fmtDateTime } from '../../utils/format';
import { OPS_ROLES } from '../../config';
import { SP } from '../../theme';
import type { RequestsStackParams } from './types';
import { REQUEST_STATUS, SLA_META } from './labels';

type Props = NativeStackScreenProps<RequestsStackParams, 'Requests'>;

/** All Grab requests with their status, hiring SLA and how many roster slots are filled (R1, R2). */
export default function RequestsScreen({ navigation }: Props) {
  const me = useCurrentUser();
  const s = useStore();
  const now = useNow();
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const canCreate = !!me && (OPS_ROLES.includes(me.role) || me.role === 'grab_viewer');

  const list = useMemo(
    () => s.requests
      .filter((r) => showAll || (r.status !== 'closed' && r.status !== 'cancelled'))
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [s.requests, showAll],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionHeader
        title="Request Grab"
        subtitle="Status, SLA hiring, dan roster"
        action={canCreate ? { label: 'Request baru', onPress: () => navigation.navigate('RequestForm') } : undefined}
      />
      <View style={{ flexDirection: 'row', gap: SP.xs, marginBottom: SP.md }}>
        <Chip label="Aktif" active={!showAll} onPress={() => setShowAll(false)} />
        <Chip label="Semua" active={showAll} onPress={() => setShowAll(true)} />
      </View>
      {list.length === 0 && (
        <Empty
          text="Belum ada request."
          icon="document-text-outline"
          action={canCreate ? { label: 'Buat request', onPress: () => navigation.navigate('RequestForm') } : undefined}
        />
      )}
      {list.map((r) => {
        const camp = s.campaigns.find((c) => c.id === r.campaignId);
        const city = s.cities.find((c) => c.id === r.cityId);
        const venue = s.venues.find((v) => v.id === r.venueId);
        const cov = coverage(r, s.shifts);
        const filled = cov.reduce((n, d) => n + Math.min(d.scheduled, d.needed), 0);
        const slots = cov.reduce((n, d) => n + d.needed, 0);
        const sla = SLA_META[hiringSla(r, now)];
        const st = REQUEST_STATUS[r.status];
        return (
          <Card key={r.id} style={{ marginBottom: SP.sm }}>
            <ListRow
              title={`${camp?.name ?? 'Campaign'} · ${city?.name ?? r.cityId}`}
              subtitle={`${venue?.name ?? ''} · ${r.startDate} s/d ${r.endDate}`}
              meta={`${r.headcount} SPG grade ${r.grade} · ${r.shiftHours} jam · ${r.package} · slot terisi ${filled}/${slots}`}
              emphasis={{ color: st.color, label: st.label }}
              numberOfLines={2}
              onPress={() => navigation.navigate('RequestDetail', { id: r.id })}
            />
            <View style={{ flexDirection: 'row', gap: SP.sm, alignItems: 'center', flexWrap: 'wrap', marginTop: SP.xs }}>
              <Badge label={`SLA hiring ${sla.label}`} color={sla.color} />
              {r.slaHiringDue && !r.staffedAt && <Muted>batas {fmtDateTime(r.slaHiringDue)}</Muted>}
            </View>
          </Card>
        );
      })}
      {canCreate && list.length > 0 && (
        <View style={{ marginTop: SP.md }}>
          <Btn title="Request baru" variant="outline" onPress={() => navigation.navigate('RequestForm')} />
        </View>
      )}
      <View style={{ height: SP.xl }} />
    </ScrollView>
  );
}
