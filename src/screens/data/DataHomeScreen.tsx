import React, { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, Chip, Empty, Input, ListRow, Muted, SectionHeader } from '../../components/ui';
import { SpgAvatar } from '../../components/pickers';
import { useCurrentUser, useStore } from '../../store/useStore';
import { FIELD_ROLES, OPS_ROLES, ROLE_LABEL } from '../../config';
import { C, SP } from '../../theme';
import type { DataStackParams } from './types';

type Props = NativeStackScreenProps<DataStackParams, 'DataHome'>;
type Tab = 'spg' | 'venue' | 'campaign' | 'staff';

/** Master data for SPC staff: SPG roster (R4/R5), venues with geofence pins, campaigns with KPI templates (R9), staff accounts. */
export default function DataHomeScreen({ navigation }: Props) {
  const me = useCurrentUser()!;
  const s = useStore();
  const [tab, setTab] = useState<Tab>('spg');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const isOps = OPS_ROLES.includes(me.role);
  const canProvision = me.role === 'super_admin' || me.role === 'back_office';

  const tabs: { key: Tab; label: string }[] = [
    { key: 'spg', label: 'SPG' },
    { key: 'venue', label: 'Venue' },
    { key: 'campaign', label: 'Campaign' },
    ...(me.role === 'super_admin' ? [{ key: 'staff' as Tab, label: 'Akun staf' }] : []),
  ];
  const match = (t: string) => t.toLowerCase().includes(q.trim().toLowerCase());
  const cityName = (id: string | null) => s.cities.find((c) => c.id === id)?.name ?? '';

  const onRefresh = async () => {
    setRefreshing(true);
    try { await s.refresh(); } catch { /* keep */ } finally { setRefreshing(false); }
  };

  const field = s.profiles.filter((p) => FIELD_ROLES.includes(p.role) && (match(p.name) || match(p.username)));
  const staff = s.profiles.filter((p) => !FIELD_ROLES.includes(p.role) && (match(p.name) || match(p.username)));

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap', marginBottom: SP.md }}>
        {tabs.map((t) => <Chip key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />)}
      </View>
      {(tab === 'spg' || tab === 'staff') && (
        <View style={{ marginBottom: SP.md }}><Input placeholder="Cari nama atau username" value={q} onChangeText={setQ} /></View>
      )}

      {tab === 'spg' && (
        <>
          <SectionHeader
            title={`SPG & koordinator (${field.length})`}
            subtitle="Grade, dokumen, training, foto untuk roster"
            level="card"
            action={canProvision ? { label: 'Tambah SPG', onPress: () => navigation.navigate('AccountForm', { role: 'spg' }) } : undefined}
          />
          {field.length === 0 && <Empty text="Belum ada SPG." icon="people-outline" />}
          {field.map((p) => {
            const trained = s.trainings.filter((t) => t.spgId === p.id).length;
            const ready = p.documentsOk && p.phoneOk && p.bpjsRegistered && !!p.photoPath;
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
                <SpgAvatar name={p.name} path={p.photoPath} />
                <View style={{ flex: 1 }}>
                  <ListRow
                    title={`${p.name}${p.role === 'coordinator' ? ' · Koordinator' : ''}`}
                    subtitle={`@${p.username} · ${cityName(p.cityId)} · Grade ${p.grade ?? '-'} · ${trained} training`}
                    emphasis={!p.active ? { color: C.muted, label: 'Nonaktif' } : ready ? { color: C.ok, label: 'Siap' } : { color: C.warn, label: 'Belum lengkap' }}
                    onPress={() => navigation.navigate('SpgDetail', { id: p.id })}
                  />
                </View>
              </View>
            );
          })}
        </>
      )}

      {tab === 'venue' && (
        <>
          <SectionHeader title={`Venue (${s.venues.length})`} subtitle="Titik geofence clock-in" level="card"
            action={isOps ? { label: 'Tambah venue', onPress: () => navigation.navigate('VenueForm', {}) } : undefined} />
          {s.venues.length === 0 && <Empty text="Belum ada venue." icon="business-outline" />}
          {[...s.venues].sort((a, b) => cityName(a.cityId).localeCompare(cityName(b.cityId)) || a.name.localeCompare(b.name)).map((v) => (
            <ListRow key={v.id} title={v.name} subtitle={`${cityName(v.cityId)} · radius ${v.radiusM} m`} meta={v.address}
              onPress={isOps ? () => navigation.navigate('VenueForm', { id: v.id }) : undefined} />
          ))}
        </>
      )}

      {tab === 'campaign' && (
        <>
          <SectionHeader title={`Campaign (${s.campaigns.length})`} subtitle="Template KPI per campaign" level="card"
            action={isOps ? { label: 'Tambah campaign', onPress: () => navigation.navigate('CampaignForm', {}) } : undefined} />
          {s.campaigns.length === 0 && <Empty text="Belum ada campaign." icon="megaphone-outline" />}
          {s.campaigns.map((c) => (
            <ListRow key={c.id} title={c.name} subtitle={`${c.type} · ${c.kpiFields.map((f) => f.label).join(', ') || 'tanpa KPI'}`}
              emphasis={c.active ? undefined : { color: C.muted, label: 'Nonaktif' }}
              onPress={isOps ? () => navigation.navigate('CampaignForm', { id: c.id }) : undefined} />
          ))}
        </>
      )}

      {tab === 'staff' && (
        <>
          <SectionHeader title={`Akun staf & Grab (${staff.length})`} level="card" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, marginBottom: SP.sm }}>
            {(['pic', 'back_office', 'grab_viewer', 'super_admin'] as const).map((r) => (
              <Chip key={r} label={`+ ${ROLE_LABEL[r]}`} onPress={() => navigation.navigate('AccountForm', { role: r })} />
            ))}
          </View>
          <Card>
            {staff.map((p) => (
              <ListRow key={p.id} title={p.name} subtitle={`@${p.username} · ${ROLE_LABEL[p.role]}`}
                emphasis={p.active ? undefined : { color: C.muted, label: 'Nonaktif' }}
                onPress={() => navigation.navigate('SpgDetail', { id: p.id })} />
            ))}
          </Card>
          <Muted style={{ marginTop: SP.sm }}>Akun Grab hanya bisa membaca: request, roster, kehadiran, KPI, peta live, laporan terbit.</Muted>
        </>
      )}
      <View style={{ height: SP.xl }} />
    </ScrollView>
  );
}
