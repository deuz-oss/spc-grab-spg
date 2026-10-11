import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purgeQueue, purgeable, type PurgeIO, type QueuedObject } from './purge';

const U = '00000000-0000-0000-0000-0000000000e1';
const sel = (n: number): QueuedObject => ({ bucket: 'selfies', path: `${U}/a_${n}-in.jpg` });

/** In-memory queue and storage behaving like media_purge_queue + a bucket. */
function fake(queue: QueuedObject[], opts: { failRemove?: boolean; failDequeue?: boolean } = {}) {
  const stored = new Set(queue.map((o) => `${o.bucket}/${o.path}`));
  const key = (o: QueuedObject) => `${o.bucket}/${o.path}`;
  const calls: string[] = [];
  const io: PurgeIO = {
    async next(limit, skip) {
      const s = new Set(skip.map(key));
      return queue.filter((o) => !s.has(key(o))).slice(0, limit);
    },
    async remove(bucket, paths) {
      calls.push(`remove ${bucket} ${paths.length}`);
      if (opts.failRemove) return { error: 'storage down' };
      paths.forEach((p) => stored.delete(`${bucket}/${p}`));
      return { error: null };
    },
    async dequeue(bucket, paths) {
      calls.push(`dequeue ${bucket} ${paths.length}`);
      if (opts.failDequeue) return { error: 'db down' };
      queue = queue.filter((o) => !(o.bucket === bucket && paths.includes(o.path)));
      return { error: null };
    },
  };
  return { io, calls, stored, get queue() { return queue; } };
}

test('deletes queued selfies and empties the queue, in batches', async () => {
  const f = fake(Array.from({ length: 250 }, (_, i) => sel(i)));
  const r = await purgeQueue(f.io, { batch: 100 });
  assert.equal(r.purged, 250);
  assert.deepEqual(r.errors, []);
  assert.equal(r.more, false);
  assert.equal(f.queue.length, 0);
  assert.equal(f.stored.size, 0);
  assert.deepEqual(f.calls, ['remove selfies 100', 'dequeue selfies 100', 'remove selfies 100', 'dequeue selfies 100', 'remove selfies 50', 'dequeue selfies 50']);
});

test('never touches other buckets or odd paths; they stay queued and are reported', async () => {
  const odd: QueuedObject[] = [
    { bucket: 'kpi-proof', path: `${U}/k1.jpg` },
    { bucket: 'profile-photos', path: `${U}/photo.jpg` },
    { bucket: 'selfies', path: `../${U}/x.jpg` },
    { bucket: 'selfies', path: `/${U}/x.jpg` },
    { bucket: 'selfies', path: `${U}/sub/x.jpg` },
    { bucket: 'selfies', path: `not-a-uid/x.jpg` },
  ];
  const f = fake([...odd, sel(1)]);
  const r = await purgeQueue(f.io);
  assert.equal(r.purged, 1);
  assert.equal(r.skipped.length, odd.length);
  assert.equal(f.queue.length, odd.length);
  assert.ok(f.calls.every((c) => c.includes('selfies 1')));
});

test('storage failure keeps everything queued and stops the run', async () => {
  const f = fake([sel(1), sel(2)], { failRemove: true });
  const r = await purgeQueue(f.io);
  assert.equal(r.purged, 0);
  assert.equal(r.errors[0]?.error, 'storage down');
  assert.equal(f.queue.length, 2);
  assert.deepEqual(f.calls, ['remove selfies 2']);
});

test('queue failure after a delete is reported; the next run finishes it', async () => {
  const f = fake([sel(1)], { failDequeue: true });
  const r = await purgeQueue(f.io);
  assert.equal(r.purged, 0);
  assert.match(r.errors[0]?.error ?? '', /dequeue/);
  assert.equal(f.queue.length, 1);
});

test('stops at maxRounds and says there is more', async () => {
  const f = fake(Array.from({ length: 30 }, (_, i) => sel(i)));
  const r = await purgeQueue(f.io, { batch: 10, maxRounds: 2 });
  assert.equal(r.purged, 20);
  assert.equal(r.more, true);
});

test('purgeable: only "<uid>/<file>" in the selfies bucket', () => {
  assert.equal(purgeable(sel(1)), null);
  for (const path of [`${U}/..`, `${U}/.`, `${U}/`, U, `${U}/a b.jpg`, `${U.toUpperCase()}/x.jpg`]) {
    assert.match(purgeable({ bucket: 'selfies', path }) ?? 'ACCEPTED', /path/, path);
  }
  assert.match(purgeable({ bucket: 'kpi-proof', path: `${U}/k.jpg` }) ?? 'ACCEPTED', /bucket/);
});
