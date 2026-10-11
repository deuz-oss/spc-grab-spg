/**
 * Retention purge, storage half (decision D5, approved 9 Oct 2026). Each night
 * purge_expired_personal_data() (migration 0003) drops selfie references older than 12 months and queues the
 * objects in media_purge_queue; this deletes those objects from storage and takes them off the queue.
 *
 * Pure — no Deno or Supabase imports — so it is unit-tested in plain Node (purge.test.ts); index.ts wires it
 * to the service-role client.
 *
 * Safety rules, because this is the one place that deletes files:
 *   - only buckets in PURGEABLE_BUCKETS (D5 covers selfies only; KPI proof and profile photos are kept);
 *   - only paths shaped '<owner uid>/<file>' — the shape every upload uses (utils/photoRef.ts) — never
 *     anything with '..', a leading slash or a deeper folder;
 *   - a queue row is removed only after storage confirmed the delete for its bucket. Rows that break a rule,
 *     or whose delete failed, stay queued and are reported, so nothing is lost silently.
 */
export const PURGEABLE_BUCKETS = ['selfies'] as const;

// '<uuid>/<file>'; the file name may not be '.' or '..'.
const OBJECT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

export interface QueuedObject {
  bucket: string;
  path: string;
}

export interface PurgeIO {
  /** Oldest queued objects first, at most `limit`, skipping ones already reported as not purgeable. */
  next(limit: number, skip: QueuedObject[]): Promise<QueuedObject[]>;
  /** Deletes objects from one bucket. Objects that are already gone count as deleted. */
  remove(bucket: string, paths: string[]): Promise<{ error: string | null }>;
  /** Takes objects off the queue. */
  dequeue(bucket: string, paths: string[]): Promise<{ error: string | null }>;
}

export interface PurgeResult {
  /** Objects deleted from storage and taken off the queue. */
  purged: number;
  /** Objects left in the queue, with the reason. */
  skipped: { bucket: string; path: string; reason: string }[];
  /** Storage or queue errors per bucket (those objects stay queued for the next run). */
  errors: { bucket: string; error: string }[];
  /** The run stopped at maxRounds with more work queued. */
  more: boolean;
}

export function purgeable(o: QueuedObject): string | null {
  if (!(PURGEABLE_BUCKETS as readonly string[]).includes(o.bucket)) return `bucket "${o.bucket}" is not purged by retention`;
  if (!OBJECT_PATH.test(o.path)) return 'path is not "<owner uid>/<file>"';
  return null;
}

export async function purgeQueue(io: PurgeIO, opts: { batch?: number; maxRounds?: number } = {}): Promise<PurgeResult> {
  const batch = opts.batch ?? 100;
  const maxRounds = opts.maxRounds ?? 20;
  const result: PurgeResult = { purged: 0, skipped: [], errors: [], more: false };
  const skip: QueuedObject[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const rows = await io.next(batch, skip);
    if (rows.length === 0) return result;

    const byBucket = new Map<string, string[]>();
    for (const row of rows) {
      const reason = purgeable(row);
      if (reason) {
        result.skipped.push({ ...row, reason });
        skip.push(row);
        continue;
      }
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
    }

    for (const [bucket, paths] of byBucket) {
      const removed = await io.remove(bucket, paths);
      if (removed.error) {
        // Storage refused: keep them queued; retrying in this run would only fail the same way.
        result.errors.push({ bucket, error: removed.error });
        return result;
      }
      const dequeued = await io.dequeue(bucket, paths);
      if (dequeued.error) {
        // Deleted but still queued: the next run deletes them again (a no-op) and dequeues them then.
        result.errors.push({ bucket, error: `dequeue: ${dequeued.error}` });
        return result;
      }
      result.purged += paths.length;
    }
  }
  result.more = true;
  return result;
}
