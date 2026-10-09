import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Btn, Card, Muted, SectionHeader } from '../components/ui';
import { showDialog, showToast } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { ROLE_LABEL } from '../config';
import { OP_LABEL } from '../store/replay';
import { fmtDateTime } from '../utils/format';
import { SP, T } from '../theme';

export default function ProfileScreen() {
  const me = useCurrentUser();
  const { queue, syncing, lastSyncAt, offlineSnapshotAt, syncQueue, signOut, cities } = useStore();
  if (!me) return null;

  const sync = async () => {
    const r = await syncQueue();
    if (r.failed.length) {
      showDialog('Sebagian Data Ditolak Server', r.failed.map((op) => OP_LABEL[op.type]).join(', '));
    } else showToast(r.synced ? `${r.synced} data terkirim` : 'Tidak ada yang perlu dikirim', 'info');
  };

  const confirmSignOut = () => {
    if (queue.length) {
      showDialog('Masih Ada Data Belum Terkirim', 'Data tetap tersimpan di HP ini dan akan dikirim saat Anda masuk lagi.', [
        { label: 'Batal' },
        { label: 'Tetap Keluar', destructive: true, onPress: () => void signOut() },
      ]);
    } else void signOut();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg }}>
      <SectionHeader title={me.name} subtitle={`${ROLE_LABEL[me.role]} · @${me.username}`} />
      <Card style={{ marginBottom: SP.md }}>
        {me.grade && <Text style={T.body}>Grade {me.grade}</Text>}
        {me.cityId && <Text style={T.body}>{cities.find((c) => c.id === me.cityId)?.name ?? me.cityId}</Text>}
        <Muted>Sinkron terakhir: {lastSyncAt ? fmtDateTime(lastSyncAt) : '—'}</Muted>
        {offlineSnapshotAt && <Muted>Mode offline sejak {fmtDateTime(offlineSnapshotAt)}</Muted>}
      </Card>
      <Card style={{ marginBottom: SP.md }}>
        <Text style={T.label}>Data menunggu sinyal: {queue.length}</Text>
        {queue.slice(0, 5).map((op) => (
          <Muted key={op.id}>• {OP_LABEL[op.type]}</Muted>
        ))}
        <View style={{ marginTop: SP.sm }}>
          <Btn title="Kirim Sekarang" variant="outline" small onPress={sync} loading={syncing} disabled={!queue.length} />
        </View>
      </Card>
      <Btn title="Keluar" variant="danger" onPress={confirmSignOut} />
    </ScrollView>
  );
}
