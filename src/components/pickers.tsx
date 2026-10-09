import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Chip, Field, Input } from './ui';
import { getPhotoUrl } from '../utils/storage';
import { PROFILE_PHOTO_BUCKET } from '../utils/photoRef';
import { C, SP, T } from '../theme';

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Single choice as a wrap of chips — no native picker, works the same on Android and web. */
export function ChipPicker<T extends string>({
  label, options, value, onChange, required,
}: { label: string; options: Option<T>[]; value: T | null; onChange: (v: T) => void; required?: boolean }) {
  return (
    <Field label={label} required={required}>
      {options.length === 0 ? (
        <Text style={T.small}>Belum ada pilihan.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs }}>
          {options.map((o) => (
            <Chip key={o.value} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />
          ))}
        </View>
      )}
    </Field>
  );
}

/** Date as YYYY-MM-DD text with a format check (WIB calendar dates; no time zone involved). */
export function DateField({
  label, value, onChange, required,
}: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const bad = value !== '' && !isDate(value);
  return (
    <Field label={label} required={required} error={bad ? 'Format tanggal: TTTT-BB-HH, contoh 2026-11-02' : null}>
      <Input value={value} onChangeText={onChange} placeholder="2026-11-02" autoCapitalize="none" maxLength={10} />
    </Field>
  );
}

export function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** SPG photo from the private bucket through a short-lived signed URL; initials when there is none. */
export function SpgAvatar({ name, path, size = 44 }: { name: string; path: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (path) void getPhotoUrl(PROFILE_PHOTO_BUCKET, path).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [path]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  if (path && url) {
    return <Image source={{ uri: url }} accessibilityLabel={`Foto ${name}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.divider }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[T.label, { color: C.muted }]}>{initials || '?'}</Text>
    </View>
  );
}
