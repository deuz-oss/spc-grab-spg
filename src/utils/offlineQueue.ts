import AsyncStorage from '@react-native-async-storage/async-storage';
import { Attendance, KpiLog } from '../types';

/**
 * Persisted queue of field writes that could not reach the server (no signal at the venue).
 * Same model as spc-nc-workforce: ops replay strictly in order (a clock-out never lands before
 * its clock-in), each op carries the full row it needs, and photos are copied to app storage
 * (`localPhotoUri`) and only uploaded at replay time — a row that needs a photo is never
 * inserted without it. Native only for photos; web stays online-required for them.
 */
export type QueuedOp =
  | { id: string; type: 'clockIn'; attendance: Attendance; localSelfieUri: string }
  | { id: string; type: 'clockOut'; attendanceId: string; clockOutAt: number; lat: number; lng: number }
  | { id: string; type: 'submitKpi'; log: KpiLog; localProofUri?: string };

/** One queue per user: ops pass RLS only under that user's session. */
const queueKey = (userId: string) => `spc_grab_offline_queue_v1:${userId}`;

export async function loadQueue(userId: string): Promise<QueuedOp[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(userId: string, queue: QueuedOp[]): Promise<void> {
  try {
    await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch {
    /* best-effort — worst case the queue is lost on next cold start */
  }
}
