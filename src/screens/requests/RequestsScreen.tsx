import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Chip, Empty, scrollRegion } from '../../components/ui';
import { useCurrentUser, useStore } from '../../store/useStore';
import { useNow } from '../../components/useNow';
import { coverage, hiringSla, type SlaState } from '../../utils/roster';
import { fmtDateTime, fmtDayShort } from '../../utils/format';
import { OPS_ROLES } from '../../config';
import { C, ELEV, R, SP, T, toneOf } from '../../theme';
import type { GrabRequest } from '../../types';
import type { RequestsStackParams } from './types';
import { PACKAGE_LABEL, REQUEST_STATUS } from './labels';

type Props = NativeStackScreenProps<RequestsStackParams, 'Requests'>;

const SLA_LINE: Record<SlaState, { icon: 'timer-outline' | 'alert-circle' | 'checkmark-circle' | 'time'; color: string; text: (r: GrabRequest) => string }> = {
  open: { icon: 'timer-outline', color: C.muted, text: (r) => `SLA hiring sampai ${fmtDateTime(r.slaHiringDue)}` },
  breached: { icon: 'alert-circle', color: C.dangerStrong, text: (r) => `SLA hiring terlewat sejak ${fmtDateTime(r.slaHiringDue)}` },
  met: { icon: 'checkmark-circle', color: C.okStrong, text: (r) => `Roster lengkap ${fmtDateTime(r.staffedAt)}, dalam SLA` },
  missed: { icon: 'time', color: C.warnStrong, text: (r) => `Roster lengkap ${fmtDateTime(r.staffedAt)}, lewat SLA` },
};

/** All Grab requests: what, where, when, how full the roster is, and where the hiring SLA stands (R1, R2). */
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
  const breached = list.filter((r) => hiringSla(r, now) === 'breached').length;

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep */ } finally { setRefreshing(false); }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: SP.lg, gap: SP.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      {...scrollRegion('Daftar request')}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
        <Chip label="Aktif" active={!showAll} onPress={() => setShowAll(false)} />
        <Chip label="Semua" active={showAll} onPress={() => setShowAll(true)} />
        <View style={{ flex: 1 }} />
        {canCreate && <Btn title="Request baru" small onPress={() => navigation.navigate('RequestForm')} />}
      </View>
      {breached > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm, backgroundColor: C.dangerBg, borderRadius: R.input, padding: SP.md }}>
          <Ionicons name="alert-circle" size={20} color={C.dangerStrong} />
          <Text style={[T.label, { color: C.dangerStrong, flex: 1 }]}>
            {breached} request melewati SLA hiring dan rosternya belum lengkap.
          </Text>
        </View>
      )}
      {list.length === 0 && (
        <Empty
          text={showAll ? 'Belum ada request.' : 'Tidak ada request aktif.'}
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
        const slaState = hiringSla(r, now);
        const sla = SLA_LINE[slaState];
        const st = REQUEST_STATUS[r.status];
        const tone = toneOf(st.color);
        const oneDay = r.startDate === r.endDate;
        return (
          <TouchableOpacity
            key={r.id}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('RequestDetail', { id: r.id })}
            accessibilityRole="button"
            accessibilityLabel={`${camp?.name ?? 'Request'} ${city?.name ?? ''}, ${st.label}, ${filled} dari ${slots} slot terisi`}
            style={{ backgroundColor: C.card, borderRadius: R.card, padding: SP.lg, gap: SP.sm, ...ELEV[1] }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={T.h2}>{camp?.name ?? 'Campaign'}</Text>
                <Text style={T.small}>{city?.name ?? r.cityId}, {venue?.name ?? ''}</Text>
              </View>
              <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: SP.md, paddingVertical: 4 }}>
                <Text style={[T.badge, { color: tone.fg }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={T.label}>
              {oneDay ? fmtDayShort(r.startDate) : `${fmtDayShort(r.startDate)} – ${fmtDayShort(r.endDate)}`}
              <Text style={{ color: C.muted }}>   {r.headcount} SPG/hari, grade {r.grade}, {r.shiftHours} jam, {PACKAGE_LABEL[r.package].toLowerCase()}</Text>
            </Text>
            <View style={{ gap: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: C.divider, overflow: 'hidden' }}>
                <View style={{ width: `${slots ? Math.round((filled / slots) * 100) : 0}%`, height: 8, backgroundColor: filled >= slots ? C.ok : C.primary }} />
              </View>
              <Text style={T.meta}>{filled} dari {slots} slot SPG terisi</Text>
            </View>
            {r.status !== 'cancelled' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={sla.icon} size={16} color={sla.color} />
                <Text style={[T.meta, { color: sla.color }]}>{sla.text(r)}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
      <View style={{ height: SP.lg }} />
    </ScrollView>
  );
}
