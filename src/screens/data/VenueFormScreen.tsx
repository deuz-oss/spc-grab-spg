import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Btn, Card, Field, Input, Muted, SectionHeader } from '../../components/ui';
import { ChipPicker } from '../../components/pickers';
import { LeafletMap } from '../../components/LeafletMap';
import { showDialog, showToast } from '../../components/dialog';
import { useStore } from '../../store/useStore';
import { requestCurrentCoords } from '../../utils/location';
import { SP } from '../../theme';
import type { DataStackParams } from './types';

type Props = NativeStackScreenProps<DataStackParams, 'VenueForm'>;

/** Parses "lat, lng" pasted from Google Maps, or a single number. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -11.5 || lat > 6.5 || lng < 94 || lng > 141.5) return null; // Indonesia, as the database checks
  return { lat, lng };
}

/**
 * Venue pin and geofence radius (every clock-in is measured against it by the server). The PIC sets
 * the pin by standing at the venue entrance, or pastes coordinates from Google Maps.
 */
export default function VenueFormScreen({ route, navigation }: Props) {
  const s = useStore();
  const existing = s.venues.find((v) => v.id === route.params.id);
  const [cityId, setCityId] = useState<string | null>(existing?.cityId ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [coords, setCoords] = useState(existing ? `${existing.lat}, ${existing.lng}` : '');
  const [radius, setRadius] = useState(String(existing?.radiusM ?? 150));
  const [busy, setBusy] = useState(false);
  const pos = parseLatLng(coords);

  const here = async () => {
    try {
      const c = await requestCurrentCoords();
      if (c.mocked) return showDialog('Lokasi Palsu', 'Matikan aplikasi pemalsu lokasi lalu coba lagi.');
      setCoords(`${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`);
    } catch (e) {
      showDialog('Lokasi Tidak Didapat', e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    const r = Number(radius);
    if (!cityId || !name.trim()) return showDialog('Lengkapi Venue', 'Kota dan nama venue wajib.');
    if (!pos) return showDialog('Koordinat Tidak Valid', 'Format: -7.2625, 112.7389 (di wilayah Indonesia).');
    if (!Number.isInteger(r) || r < 30 || r > 1000) return showDialog('Radius Tidak Valid', 'Radius 30–1000 meter.');
    setBusy(true);
    try {
      await s.saveVenue({ id: existing?.id, cityId, name: name.trim(), address: address.trim(), lat: pos.lat, lng: pos.lng, radiusM: r });
      showToast('Venue tersimpan');
      navigation.goBack();
    } catch (e) {
      showDialog('Gagal Menyimpan', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.sm }} keyboardShouldPersistTaps="handled">
      <SectionHeader title={existing ? 'Ubah venue' : 'Venue baru'} subtitle="Titik ini dipakai server untuk cek lokasi clock-in" />
      <ChipPicker label="Kota" required value={cityId} onChange={setCityId} options={s.cities.map((c) => ({ value: c.id, label: c.name }))} />
      <Field label="Nama venue" required><Input value={name} onChangeText={setName} placeholder="mis. Tunjungan Plaza 3, Lobby" /></Field>
      <Field label="Alamat"><Input value={address} onChangeText={setAddress} multiline /></Field>
      <Field label="Koordinat (lat, lng)" required error={coords && !pos ? 'Format: -7.2625, 112.7389' : null}>
        <Input value={coords} onChangeText={setCoords} placeholder="-7.2625, 112.7389" autoCapitalize="none" />
      </Field>
      <Btn title="Pakai lokasi saya sekarang" small variant="outline" onPress={here} />
      <Field label="Radius geofence (meter)" required>
        <Input value={radius} onChangeText={setRadius} keyboardType="number-pad" maxLength={4} />
      </Field>
      <Muted>150 m cukup untuk mal; perbesar untuk area terbuka/event. Perubahan titik dan radius tercatat di audit log.</Muted>
      {pos && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <LeafletMap markers={[{ ...pos, label: name || 'Venue' }]} center={pos} zoom={17} height={220} />
        </Card>
      )}
      <Btn title="Simpan Venue" onPress={save} loading={busy} />
    </ScrollView>
  );
}
