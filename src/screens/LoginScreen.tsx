import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Btn, Card, Field, Input } from '../components/ui';
import { useStore } from '../store/useStore';
import { APP_NAME } from '../config';
import { C, F, SP, T } from '../theme';

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
        <View style={{ alignItems: 'center', marginBottom: SP.xl }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="location" size={28} color={C.onGold} />
          </View>
          <Text style={[T.display, { color: C.onDark, marginTop: SP.md }]}>{APP_NAME}</Text>
          <Text style={[T.body, { color: C.onDarkMuted, marginTop: SP.xs }]}>PT Sinergi Performa Cipta</Text>
        </View>
        <Card style={{ maxWidth: 420, width: '100%', alignSelf: 'center' }}>
          <Field label="Username" required>
            <Input value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="mis. budi.sby" />
          </Field>
          <Field label="Password" required error={error ?? undefined}>
            <Input value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
          </Field>
          <Btn title="Masuk" onPress={submit} loading={busy} />
          <Text style={[T.meta, { marginTop: SP.md, textAlign: 'center' }]}>
            Akun dibuat oleh SPC. Lupa password? Hubungi PIC Anda.
          </Text>
        </Card>
        <Text style={[T.meta, { color: C.onDarkFaint, textAlign: 'center', marginTop: SP.lg, fontFamily: F.reg }]}>
          Data lokasi dan foto hanya dipakai untuk absensi dan laporan program.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
