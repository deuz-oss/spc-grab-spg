// Supabase Edge Function: deletes the storage objects queued in media_purge_queue by the nightly retention job
// (purge_expired_personal_data, migration 0003; decision D5 — selfies older than 12 months). The logic and its
// safety rules are in purge.ts. Not for the app: only the service role may run it (pg_cron via pg_net, or an
// operator), so a user token — even a super admin's — is refused. Scheduling: README "Retention".
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { purgeQueue, type QueuedObject } from './purge.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Constant-time string comparison, so the key cannot be guessed from response timing. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token || !sameSecret(token, SERVICE_ROLE_KEY)) return json({ error: 'Service role only' }, 403);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const result = await purgeQueue({
      async next(limit, skip) {
        // Fetch past the rows already reported as not purgeable, so they cannot starve the rest.
        const { data, error } = await admin.from('media_purge_queue').select('bucket, path')
          .order('queued_at').order('bucket').order('path').limit(limit + skip.length);
        if (error) throw new Error(error.message);
        const skipped = new Set(skip.map((o) => `${o.bucket}/${o.path}`));
        return ((data ?? []) as QueuedObject[]).filter((o) => !skipped.has(`${o.bucket}/${o.path}`)).slice(0, limit);
      },
      async remove(bucket, paths) {
        const { error } = await admin.storage.from(bucket).remove(paths);
        return { error: error?.message ?? null };
      },
      async dequeue(bucket, paths) {
        const { error } = await admin.from('media_purge_queue').delete().eq('bucket', bucket).in('path', paths);
        return { error: error?.message ?? null };
      },
    });
    if (result.skipped.length) console.warn('purge-media: left in queue', result.skipped);
    if (result.errors.length) console.error('purge-media: errors', result.errors);
    return json(result, result.errors.length ? 500 : 200);
  } catch (err) {
    console.error('purge-media failed:', err);
    return json({ error: 'Purge failed; see function logs.' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
