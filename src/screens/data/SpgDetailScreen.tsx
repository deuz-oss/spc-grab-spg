import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Card, Chip, Empty, Field, Input, ListRow, Muted, SectionHeader } from '../../components/ui';
import { ChipPicker, SpgAvatar } from '../../components/pickers';
import { showDialog, showToast } from '../../components/dialog';
import { useCurrentUser, useStore } from '../../store/useStore';
import { FIELD_ROLES, ROLE_LABEL } from '../../config';
import { passwordProblem } from '../../utils/password';
import { fmtDateTime } from '../../utils/format';
import { C, SP, T } from '../../theme';
import type { Profile } from '../../types';
import type { DataStackParams } from './types';

type Props = NativeStackScreenProps<DataStackParams, 'SpgDetail'>;

/**
 * One account. For SPG / coordinators: onboarding checklist (R4), photo for the roster (R3),
 * training per campaign (R5), consent status (R16). Account actions go through the admin-users
 * edge function (super admin; back office for field workers).
 */
export default function SpgDetailScreen({ route }: Props) {
  const me = useCurrentUser()!;
  const s = useStore();
  const p = s.profiles.find((x) => x.id === route.params.id);
  const [phone, setPhone] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    s.fetchPhones().then((m) => live && setPhone(m[route.params.id] ?? '')).catch(() => live && setPhone(''));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.id]);

  if (!p) return <Empty text="Akun tidak ditemukan." icon="alert-circle-outline" />;

  const field = FIELD_ROLES.includes(p.role);
  const isStaff = ['super_admin', 'pic', 'back_office'].includes(me.role);
  const canAccount = me.role === 'super_admin' || (me.role === 'back_office' && field);
  const trainings = s.trainings.filter((t) => t.spgId === p.id);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      showDialog('Gagal', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const patch = (v: Parameters<typeof s.updateProfile>[1]) => run('patch', () => s.updateProfile(p.id, v), 'Tersimpan');

  const takePhoto = async () => {
    let res: ImagePicker.ImagePickerResult;
    if (Platform.OS === 'web') {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    } else {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return showDialog('Izin Kamera Diperlukan', 'Izinkan kamera untuk mengambil foto SPG.');
      res = await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: true, aspect: [1, 1] });
    }
    if (res.canceled || !res.assets[0]) return;
    await run('photo', () => s.setProfilePhoto(p.id, res.assets[0]!.uri), 'Foto tersimpan');
  };

  const addTraining = () => {
    if (!campaignId) return showDialog('Pilih Campaign', 'Pilih campaign yang training-nya lulus.');
    const n = score.trim() === '' ? null : Number(score);
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) return showDialog('Nilai Tidak Valid', 'Nilai 0–100 atau kosongkan.');
    void run('training', () => s.recordTraining(p.id, campaignId, n), 'Training lulus tercatat');
    setCampaignId(null);
    setScore('');
  };

  const resetPassword = () => {
    const err = passwordProblem(password, p.username);
    if (err) return showDialog('Password Belum Sesuai', err);
    void run('pw', () => s.setPassword(p.id, password), 'Password diganti — beri tahu pemilik akun');
    setPassword('');
  };

  const toggleActive = () =>
    showDialog(p.active ? 'Nonaktifkan Akun?' : 'Aktifkan Akun?', p.active ? 'Akun tidak bisa masuk dan tidak bisa dijadwalkan.' : undefined, [
      { label: 'Batal' },
      { label: p.active ? 'Nonaktifkan' : 'Aktifkan', destructive: p.active, onPress: () => void run('active', () => s.setActive(p.id, !p.active), 'Status akun diubah') },
    ]);

  const check = (label: string, value: boolean, key: keyof Pick<Profile, 'documentsOk' | 'phoneOk' | 'bpjsRegistered'>) => (
    <Chip label={label} active={value} color={C.ok}
      onPress={isStaff ? () => void patch({ [key]: !value }) : undefined} />
  );

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.md }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
        <SpgAvatar name={p.name} path={p.photoPath} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={T.h2}>{p.name}</Text>
          <Muted>@{p.username} · {ROLE_LABEL[p.role]}{p.active ? '' : ' · NONAKTIF'}</Muted>
          {phone ? <Muted>HP {phone}</Muted> : null}
        </View>
      </View>

      {field && (
        <>
          <Card style={{ gap: SP.sm }}>
            <SectionHeader title="Data kerja" level="card" />
            <ChipPicker label="Kota" value={p.cityId} onChange={(v) => void patch({ cityId: v })}
              options={s.cities.map((c) => ({ value: c.id, label: c.name }))} />
            <ChipPicker label="Grade" value={p.grade} onChange={(v) => void patch({ grade: v })}
              options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} />
            <ChipPicker label="Kontrak" value={p.contractType} onChange={(v) => void patch({ contractType: v })}
              options={[{ value: 'daily_worker', label: 'Harian lepas' }, { value: 'pkwt', label: 'PKWT' }]} />
            <Field label="Checklist onboarding">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs }}>
                {check('Dokumen (KTP, ijazah, referensi)', p.documentsOk, 'documentsOk')}
                {check('HP memenuhi syarat', p.phoneOk, 'phoneOk')}
                {check('BPJS terdaftar', p.bpjsRegistered, 'bpjsRegistered')}
              </View>
            </Field>
            {isStaff && <Btn title={p.photoPath ? 'Ganti foto profil' : 'Ambil foto profil'} variant="outline" small onPress={takePhoto} loading={busy === 'photo'} />}
            <Muted>Foto profil tampil di roster yang dilihat Grab. Latar polos, wajah jelas, seragam bila ada.</Muted>
            <Muted>Persetujuan data: {p.consentAt ? `diberikan ${fmtDateTime(p.consentAt)} (${p.consentVersion})` : 'belum — diminta saat SPG pertama kali masuk'}</Muted>
          </Card>

          <Card style={{ gap: SP.sm }}>
            <SectionHeader title="Training" subtitle="Wajib lulus sebelum dijadwalkan di campaign" level="card" />
            {trainings.length === 0 && <Muted>Belum ada training.</Muted>}
            {trainings.map((t) => (
              <ListRow key={t.id} title={s.campaigns.find((c) => c.id === t.campaignId)?.name ?? t.campaignId}
                subtitle={`Lulus ${fmtDateTime(t.passedAt)}${t.score != null ? ` · nilai ${t.score}` : ''}`} />
            ))}
            {isStaff && (
              <>
                <ChipPicker label="Catat training lulus" value={campaignId} onChange={setCampaignId}
                  options={s.campaigns.filter((c) => c.active && !trainings.some((t) => t.campaignId === c.id)).map((c) => ({ value: c.id, label: c.name }))} />
                <Field label="Nilai (opsional)"><Input value={score} onChangeText={setScore} keyboardType="number-pad" maxLength={3} /></Field>
                <Btn title="Simpan training" small onPress={addTraining} loading={busy === 'training'} />
              </>
            )}
          </Card>
        </>
      )}

      {canAccount && p.id !== me.id && (
        <Card style={{ gap: SP.sm }}>
          <SectionHeader title="Akun" level="card" />
          <Field label="Password baru">
            <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Min. 8 karakter, huruf dan angka" />
          </Field>
          <Btn title="Ganti password" small variant="outline" onPress={resetPassword} loading={busy === 'pw'} />
          <Btn title={p.active ? 'Nonaktifkan akun' : 'Aktifkan akun'} small variant={p.active ? 'danger' : 'ok'} onPress={toggleActive} loading={busy === 'active'} />
        </Card>
      )}
    </ScrollView>
  );
}
