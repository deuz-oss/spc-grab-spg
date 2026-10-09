import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Field, Input, Muted, SectionHeader } from '../../components/ui';
import { ChipPicker } from '../../components/pickers';
import { showDialog, showToast } from '../../components/dialog';
import { useCurrentUser, useStore } from '../../store/useStore';
import { FIELD_ROLES, ROLE_LABEL } from '../../config';
import { passwordProblem } from '../../utils/password';
import { SP } from '../../theme';
import type { Profile, Role } from '../../types';
import type { DataStackParams } from './types';

type Props = NativeStackScreenProps<DataStackParams, 'AccountForm'>;

/** New account through the admin-users edge function; the app never holds the service-role key. */
export default function AccountFormScreen({ route, navigation }: Props) {
  const me = useCurrentUser()!;
  const s = useStore();
  const [role, setRole] = useState<Role>(route.params.role);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState<string | null>(null);
  const [grade, setGrade] = useState<NonNullable<Profile['grade']>>('C');
  const [contract, setContract] = useState<NonNullable<Profile['contractType']>>('daily_worker');
  const [busy, setBusy] = useState(false);
  const field = FIELD_ROLES.includes(role);
  const roles: Role[] = me.role === 'super_admin' ? (field ? ['spg', 'coordinator'] : ['pic', 'back_office', 'grab_viewer', 'super_admin']) : ['spg', 'coordinator'];

  const submit = async () => {
    const u = username.trim().toLowerCase();
    if (!name.trim()) return showDialog('Lengkapi Data', 'Nama wajib diisi.');
    if (!/^[a-z0-9._-]{3,40}$/.test(u)) return showDialog('Username Tidak Valid', '3–40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.');
    const pw = passwordProblem(password, u);
    if (pw) return showDialog('Password Belum Sesuai', pw);
    if (field && !cityId) return showDialog('Lengkapi Data', 'Pilih kota.');
    setBusy(true);
    try {
      await s.createAccount({
        username: u, password, name: name.trim(), role, phone: phone.trim() || null,
        cityId: field ? cityId : null, grade: field ? grade : null, contractType: field ? contract : null,
      });
      showToast(`Akun @${u} dibuat dan aktif`);
      navigation.goBack();
    } catch (e) {
      showDialog('Gagal Membuat Akun', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.sm }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={`Akun ${ROLE_LABEL[role]}`} subtitle="Masuk dengan username + password" />
      <ChipPicker label="Role" value={role} onChange={setRole} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <Field label="Nama lengkap" required><Input value={name} onChangeText={setName} /></Field>
      <Field label="Username" required>
        <Input value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="mis. sari.sby" />
      </Field>
      <Field label="Password awal" required>
        <Input value={password} onChangeText={setPassword} autoCapitalize="none" placeholder="Min. 8 karakter, huruf dan angka" />
      </Field>
      <Field label="No. HP"><Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></Field>
      {field && (
        <>
          <ChipPicker label="Kota" required value={cityId} onChange={setCityId} options={s.cities.map((c) => ({ value: c.id, label: c.name }))} />
          <ChipPicker label="Grade" required value={grade} onChange={setGrade}
            options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} />
          <ChipPicker label="Kontrak" required value={contract} onChange={setContract}
            options={[{ value: 'daily_worker', label: 'Harian lepas' }, { value: 'pkwt', label: 'PKWT' }]} />
          <Muted>Setelah dibuat: lengkapi checklist dokumen, foto profil, dan training di halaman SPG.</Muted>
        </>
      )}
      {role === 'grab_viewer' && <Muted>Akun Grab hanya membaca dan bisa mengirim request. Tidak melihat nomor HP, selfie, atau riwayat GPS.</Muted>}
      <Btn title="Buat Akun" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
