import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { showDialog } from '../components/dialog';
import { photoObjectPath, photoStoragePath, type PhotoBucket } from './photoRef';
import { uid } from './uuid';

/** Signed-URL lifetime when someone opens a selfie or proof photo. */
const SIGNED_URL_TTL_S = 60 * 60;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Uploads a camera photo to a private bucket and returns its object path
 * ("<owner uid>/<record id>.<ext>"), which is what the database row stores.
 * Web reads a real Blob; native reads base64 via expo-file-system because React
 * Native's fetch().blob() is unreliable for binary uploads from file:// URIs.
 * `upsert: false` — evidence is append-only, a second upload to the same path fails.
 */
export async function uploadPhoto(bucket: PhotoBucket, ownerId: string, recordId: string, uri: string): Promise<string> {
  const ext = extFromUri(uri);
  const path = photoObjectPath(ownerId, recordId, ext);
  const type = MIME_BY_EXT[ext] ?? 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type || type, upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) throw error;
  } else {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const { error } = await supabase.storage.from(bucket).upload(path, decode(base64), { contentType: type, upsert: false });
    // An earlier attempt that landed but lost its response leaves the object there — that is success.
    if (error && !/exists|duplicate/i.test(error.message)) throw error;
  }
  return path;
}

const signedCache = new Map<string, { url: string; until: number }>();

/** Short-lived signed URL for in-app previews, or null when the viewer may not see it. */
export async function getPhotoUrl(bucket: PhotoBucket, ref: string | null | undefined): Promise<string | null> {
  const path = photoStoragePath(ref);
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const hit = signedCache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_S);
  if (error || !data?.signedUrl) return null;
  signedCache.set(key, { url: data.signedUrl, until: Date.now() + (SIGNED_URL_TTL_S - 300) * 1000 });
  return data.signedUrl;
}

/** Opens a photo in the browser / viewer via a signed URL; storage RLS decides who may see it. */
export async function openPhoto(bucket: PhotoBucket, ref: string | null | undefined): Promise<void> {
  const path = photoStoragePath(ref);
  if (!path) {
    showDialog('Foto Belum Tersedia', 'Foto ini belum terupload (masih tersimpan offline di HP SPG).');
    return;
  }
  // Web: open the tab inside the click, then point it at the URL — after an await it would be popup-blocked.
  const tab = Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
  const url = await getPhotoUrl(bucket, path);
  if (!url) {
    tab?.close();
    showDialog('Tidak Dapat Membuka Foto', 'Foto tidak ditemukan atau Anda tidak punya akses.');
    return;
  }
  if (tab) tab.location.href = url;
  else await Linking.openURL(url);
}

const PENDING_DIR = `${FileSystem.documentDirectory ?? ''}pending-photos/`;

/**
 * Copies a camera photo into an app-owned directory so it survives until the offline queue
 * uploads it (the picker's URI may live in a cache the OS evicts). Native only.
 */
export async function persistPhotoLocally(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(PENDING_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PENDING_DIR, { intermediates: true });
  const dest = `${PENDING_DIR}${uid()}.${extFromUri(uri)}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Best-effort delete of a locally persisted photo; never throws. */
export async function discardLocalPhoto(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* best-effort */
  }
}

/** Whether a queued photo's local file still exists (reinstall or cache clear can remove it). */
export async function localPhotoExists(uri: string): Promise<boolean> {
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
}

export function extFromUri(uri: string, fallback = 'jpg'): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?.*)?$/.exec(uri);
  return match ? match[1].toLowerCase() : fallback;
}
