/**
 * Photo references stored in the database (attendance_media.selfie_*_path, kpi_logs.proof_path).
 *
 * Both buckets are private (migration 0002). The stored value is the object path inside the
 * bucket, always "<owner uid>/<record id>.<ext>" — the first folder must be the uploader's uid,
 * which is what the storage policies check. Viewing goes through a short-lived signed URL.
 * Pure — no React Native imports — so it is unit-tested in plain Node.
 */
export const SELFIE_BUCKET = 'selfies';
export const KPI_PROOF_BUCKET = 'kpi-proof';
/** SPG photo for the roster Grab confirms (migration 0007); uploaded by back office. */
export const PROFILE_PHOTO_BUCKET = 'profile-photos';
export type PhotoBucket = typeof SELFIE_BUCKET | typeof KPI_PROOF_BUCKET | typeof PROFILE_PHOTO_BUCKET;

/** Object path for a new upload; the owner folder is what storage RLS checks. */
export function photoObjectPath(ownerId: string, recordId: string, ext: string): string {
  const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : 'jpg';
  return `${ownerId}/${recordId}.${safeExt}`;
}

/**
 * Bucket object path for a stored reference, or null when there is nothing viewable remotely:
 * empty, a device-local file (queued offline, not uploaded yet), or a foreign URL.
 */
export function photoStoragePath(ref: string | null | undefined): string | null {
  const v = ref?.trim();
  if (!v) return null;
  if (/^(file|content|blob|data|ph|assets-library):/i.test(v)) return null;
  if (/^https?:\/\//i.test(v)) return null;
  return v.replace(/^\/+/, '');
}
