import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Card, Chip, Field, Input, Muted, SectionHeader } from '../../components/ui';
import { ChipPicker, DateField, isDate } from '../../components/pickers';
import { showDialog, showToast } from '../../components/dialog';
import { useStore } from '../../store/useStore';
import { programDayKey } from '../../utils/period';
import { SP } from '../../theme';
import type { Campaign, KpiField } from '../../types';
import type { DataStackParams } from './types';

type Props = NativeStackScreenProps<DataStackParams, 'CampaignForm'>;

/** Field key from its label: "App downloads" -> "app_downloads". Stable once KPI logs exist. */
export function kpiKey(label: string): string {
  return label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

const TYPES: Campaign['type'][] = ['user', 'merchant', 'driver', 'launch', 'event'];

/**
 * Campaign and its KPI template (R9): which numbers SPG log per shift, and which need a proof photo.
 * Keys never change after creation — KPI logs and the daily report refer to them.
 */
export default function CampaignFormScreen({ route, navigation }: Props) {
  const s = useStore();
  const existing = s.campaigns.find((c) => c.id === route.params.id);
  const used = !!existing && s.kpiLogs.some((k) => s.shifts.some((x) => x.id === k.shiftId && s.requests.some((r) => r.id === x.requestId && r.campaignId === existing.id)));
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<Campaign['type']>(existing?.type ?? 'user');
  const [fields, setFields] = useState<KpiField[]>(existing?.kpiFields ?? []);
  const [startsOn, setStartsOn] = useState(() => programDayKey(Date.now()));
  const [endsOn, setEndsOn] = useState('');
  const [active, setActive] = useState(existing?.active ?? true);
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [proof, setProof] = useState(true);
  const [busy, setBusy] = useState(false);

  const addField = () => {
    const key = kpiKey(label);
    if (!key) return showDialog('Nama KPI', 'Isi nama KPI, mis. "App downloads".');
    if (fields.some((f) => f.key === key)) return showDialog('Sudah Ada', 'KPI dengan nama ini sudah ada.');
    setFields([...fields, { key, label: label.trim(), unit: unit.trim() || 'jumlah', proof_required: proof }]);
    setLabel('');
    setUnit('');
  };

  const save = async () => {
    if (!name.trim()) return showDialog('Lengkapi Campaign', 'Nama campaign wajib.');
    if (!fields.length) return showDialog('KPI Kosong', 'Tambahkan minimal satu KPI.');
    if (!existing && !isDate(startsOn)) return showDialog('Tanggal Mulai', 'Format TTTT-BB-HH.');
    if (endsOn && !isDate(endsOn)) return showDialog('Tanggal Selesai', 'Format TTTT-BB-HH atau kosongkan.');
    setBusy(true);
    try {
      await s.saveCampaign({ id: existing?.id, name: name.trim(), type, kpiFields: fields, startsOn, endsOn: endsOn || null, active });
      showToast('Campaign tersimpan');
      navigation.goBack();
    } catch (e) {
      showDialog('Gagal Menyimpan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.sm }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={existing ? 'Ubah campaign' : 'Campaign baru'} subtitle="KPI yang dicatat SPG per shift" />
      <Field label="Nama campaign" required><Input value={name} onChangeText={setName} placeholder="mis. GrabFood New User Okt" /></Field>
      <ChipPicker label="Jenis" required value={type} onChange={setType} options={TYPES.map((t) => ({ value: t, label: t }))} />
      {!existing && <DateField label="Mulai" required value={startsOn} onChange={setStartsOn} />}
      <DateField label="Selesai (opsional)" value={endsOn} onChange={setEndsOn} />
      {existing && (
        <View style={{ flexDirection: 'row', gap: SP.xs }}>
          <Chip label="Aktif" active={active} onPress={() => setActive(true)} />
          <Chip label="Nonaktif" active={!active} onPress={() => setActive(false)} />
        </View>
      )}

      <Card style={{ gap: SP.sm }}>
        <SectionHeader title="KPI" level="card" />
        {fields.map((f) => (
          <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
            <Muted style={{ flex: 1 }}>{f.label} ({f.unit}){f.proof_required ? ' · wajib foto bukti' : ''}</Muted>
            {!used && <Btn title="Hapus" small variant="outline" onPress={() => setFields(fields.filter((x) => x.key !== f.key))} />}
          </View>
        ))}
        {used ? (
          <Muted>KPI tidak bisa diubah karena sudah ada data dari SPG.</Muted>
        ) : (
          <>
            <Field label="Nama KPI"><Input value={label} onChangeText={setLabel} placeholder="mis. App downloads" /></Field>
            <Field label="Satuan"><Input value={unit} onChangeText={setUnit} placeholder="mis. unduhan" /></Field>
            <View style={{ flexDirection: 'row', gap: SP.xs }}>
              <Chip label="Wajib foto bukti" active={proof} onPress={() => setProof(true)} />
              <Chip label="Tanpa foto" active={!proof} onPress={() => setProof(false)} />
            </View>
            <Btn title="Tambah KPI" small variant="outline" onPress={addField} />
            <Muted>Foto bukti tidak boleh memuat data pelanggan (nama, nomor HP, wajah).</Muted>
          </>
        )}
      </Card>
      <Btn title="Simpan Campaign" onPress={save} loading={busy} />
    </ScrollView>
  );
}
