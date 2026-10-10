import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Field, Input } from '../components/ui';
import { useStore } from '../store/useStore';
import { C, ELEV, R, SP, T } from '../theme';

export default function LoginScreen() {
  const signIn = useStore((s) => s.signIn);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) return setError('Isi username dan password.');
    setBusy(true);
    setError(null);
    const err = await signIn(username, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SP.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="id-card" size={26} color={C.onGold} />
          </View>
          <Text style={[T.display, { color: C.onDark, marginTop: SP.lg }]}>Masuk ke shift Anda</Text>
          <Text style={[T.body, { color: C.onDarkMuted, marginTop: SP.xs, marginBottom: SP.xl }]}>
            Program SPG Grab — PT Sinergi Performa Cipta
          </Text>
          <View style={{ backgroundColor: C.card, borderRadius: R.card + 4, padding: SP.lg, gap: SP.md, ...ELEV[2] }}>
            <Field label="Username">
              <Input value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="mis. sari.sby" />
            </Field>
            <Field label="Password" error={error ?? undefined}>
              <Input value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
            </Field>
            <Btn title="Masuk" onPress={submit} loading={busy} />
            <Text style={[T.meta, { textAlign: 'center' }]}>Lupa password? Hubungi PIC SPC Anda.</Text>
          </View>
          <Text style={[T.meta, { color: C.onDarkFaint, marginTop: SP.lg }]}>
            Lokasi dan foto hanya dipakai untuk absensi dan laporan program.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
