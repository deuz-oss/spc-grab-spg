import type { Attendance, Shift } from '../types';

/**
 * Shifts on the SPG's "Hari Ini" tab: today's (WIB) live shifts, plus any earlier shift whose session is still
 * open. Without the second part an SPG who forgot to clock out lost the clock-out button at midnight while the
 * phone kept recording GPS until the server's auto-close (phone test 16 Oct, bug B5). Open sessions come first.
 * Pure — unit-tested in Node.
 */
export function todayShifts(shifts: Shift[], attendances: Attendance[], meId: string | undefined, today: string): Shift[] {
  if (!meId) return [];
  const open = new Set(attendances.filter((a) => a.userId === meId && !a.clockOutAt).map((a) => a.shiftId));
  return shifts
    .filter((s) => s.spgId === meId && (open.has(s.id) || (s.shiftDate === today && s.status !== 'cancelled' && s.status !== 'replaced')))
    .sort((a, b) => Number(open.has(b.id)) - Number(open.has(a.id)) || (a.shiftDate + a.plannedStart).localeCompare(b.shiftDate + b.plannedStart));
}
