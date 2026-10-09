import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Card, Muted, SectionHeader } from '../components/ui';
import { showDialog } from '../components/dialog';
import { useCurrentUser, useStore } from '../store/useStore';
import { CONSENT_TEXT, CONSENT_VERSION } from '../config';
import { SP, T } from '../theme';

/**
 * UU PDP consent (R16), shown once per consent version before an SPG or coordinator can use the app.
 * The server refuses a clock-in without it (attendances_require_consent, migration 0006) and stamps
 * the consent time itself.
 */
export default function ConsentScreen() {
  const me = useCurrentUser();
  const giveConsent = useStore((s) => s.giveConsent);
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  const agree = async () => {
    setBusy(true);
    try {
      await giveConsent();
    } catch (e) {
      showDialog('Belum Tersimpan', e instanceof Error ? e.message : 'Periksa koneksi internet lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, paddingTop: SP.lg + insets.top, gap: SP.md }}>
      <SectionHeader title="Persetujuan Data Pribadi" subtitle={`Halo ${me?.name ?? ''}`} />
      <Card>
        <Text style={T.body}>{CONSENT_TEXT}</Text>
        <View style={{ marginTop: SP.md, gap: SP.xs }}>
          <Muted>• Foto selfie hanya dilihat tim SPC, tidak dibagikan ke klien.</Muted>
          <Muted>• Lokasi GPS hanya direkam saat shift berjalan (setelah clock-in sampai clock-out).</Muted>
          <Muted>• Klien melihat nama, grade, foto profil, kehadiran, dan KPI — bukan nomor HP atau dokumen.</Muted>
          <Muted>• Foto bukti KPI tidak boleh memuat data pelanggan (nama, nomor HP, wajah).</Muted>
        </View>
        <Muted style={{ marginTop: SP.md }}>Versi {CONSENT_VERSION}</Muted>
      </Card>
      <Btn title="Saya Setuju" onPress={agree} loading={busy} />
      <Btn title="Tidak Setuju, Keluar" variant="outline" onPress={() => void signOut()} />
      <Muted>Tanpa persetujuan ini Anda tidak dapat melakukan absensi. Hubungi PIC SPC bila ada pertanyaan.</Muted>
    </ScrollView>
  );
}
