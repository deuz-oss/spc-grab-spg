import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Field, Input, Muted, SectionHeader } from '../../components/ui';
import { ChipPicker, DateField, isDate } from '../../components/pickers';
import { showDialog, showToast } from '../../components/dialog';
import { useStore } from '../../store/useStore';
import { programDayKey } from '../../utils/period';
import { useNow } from '../../components/useNow';
import { SP } from '../../theme';
import type { GrabRequest } from '../../types';
import type { RequestsStackParams } from './types';
import { PACKAGE_LABEL } from './labels';

type Props = NativeStackScreenProps<RequestsStackParams, 'RequestForm'>;

/**
 * New Grab request (R1). At go-live the PIC enters what Grab sends (decision D2); Grab can use the
 * same form later. The server sets the submission time, the SLA due date and the status.
 */
export default function RequestFormScreen({ navigation }: Props) {
  const s = useStore();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [grade, setGrade] = useState<GrabRequest['grade']>('B');
  const [headcount, setHeadcount] = useState('1');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shiftHours, setShiftHours] = useState<'8' | '10'>('8');
  const [pkg, setPkg] = useState<GrabRequest['package']>('daily');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const venues = s.venues.filter((v) => v.cityId === cityId);
  const n = Number(headcount);
  const today = programDayKey(useNow());

  const problem = (): string | null => {
    if (!campaignId) return 'Pilih campaign.';
    if (!cityId) return 'Pilih kota.';
    if (!venueId) return 'Pilih venue. Belum ada? Tambahkan di menu Data → Venue.';
    if (!Number.isInteger(n) || n < 1 || n > 500) return 'Jumlah SPG 1–500.';
    if (!isDate(startDate) || !isDate(endDate)) return 'Isi tanggal mulai dan selesai (TTTT-BB-HH).';
    if (endDate < startDate) return 'Tanggal selesai sebelum tanggal mulai.';
    if (startDate < today) return 'Tanggal mulai sudah lewat.';
    return null;
  };

  const submit = async () => {
    const p = problem();
    if (p) return showDialog('Lengkapi Request', p);
    setBusy(true);
    try {
      const id = await s.createRequest({
        campaignId: campaignId!, cityId: cityId!, venueId: venueId!, grade, headcount: n, startDate, endDate,
        shiftHours: shiftHours === '10' ? 10 : 8, package: pkg, notes: notes.trim(),
      });
      showToast('Request tersimpan — SLA hiring mulai berjalan');
      navigation.replace('RequestDetail', { id });
    } catch (e) {
      showDialog('Gagal Menyimpan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.sm }} keyboardShouldPersistTaps="handled">
      <SectionHeader title="Request baru" subtitle="Sesuai email / form request dari Grab" />
      <ChipPicker label="Campaign" required value={campaignId} onChange={setCampaignId}
        options={s.campaigns.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} />
      <ChipPicker label="Kota" required value={cityId} onChange={(v) => { setCityId(v); setVenueId(null); }}
        options={s.cities.map((c) => ({ value: c.id, label: c.name }))} />
      {cityId && (
        <ChipPicker label="Venue" required value={venueId} onChange={setVenueId}
          options={venues.map((v) => ({ value: v.id, label: v.name }))} />
      )}
      <ChipPicker label="Grade minimal" required value={grade} onChange={setGrade}
        options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} />
      <Field label="Jumlah SPG per hari" required>
        <Input value={headcount} onChangeText={setHeadcount} keyboardType="number-pad" maxLength={3} />
      </Field>
      <DateField label="Tanggal mulai" required value={startDate} onChange={setStartDate} />
      <DateField label="Tanggal selesai" required value={endDate} onChange={setEndDate} />
      <ChipPicker label="Durasi shift" required value={shiftHours} onChange={setShiftHours}
        options={[{ value: '8', label: '8 jam' }, { value: '10', label: '10 jam (8 + 2 lembur)' }]} />
      <ChipPicker label="Paket" required value={pkg} onChange={setPkg}
        options={(Object.keys(PACKAGE_LABEL) as GrabRequest['package'][]).map((k) => ({ value: k, label: PACKAGE_LABEL[k] }))} />
      {pkg === 'monthly' && <Muted>Paket bulanan: SPG dikontrak PKWT (≥ 21 hari per bulan).</Muted>}
      <Field label="Catatan">
        <Input value={notes} onChangeText={setNotes} placeholder="Mis. dress code, kontak di venue" multiline />
      </Field>
      <Btn title="Simpan Request" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
