/**
 * Scheduling and SLA rules the app shows before the server enforces them (migrations 0001, 0006).
 * The server stays the source of truth; these only let the PIC see why an SPG is not offered.
 * Pure — unit-tested in plain Node.
 */
import type { Grade, GrabRequest, Profile, Shift, Training } from '../types';

const GRADE_RANK: Record<Grade, number> = { C: 1, B: 2, A: 3 };

/** Shifts that occupy a roster slot (mirrors refresh_request_status and the one-shift-per-day index). */
export const isLive = (s: Pick<Shift, 'status'>) => s.status !== 'cancelled' && s.status !== 'replaced';

/** Every date of a request, inclusive, as YYYY-MM-DD. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export interface DayCoverage {
  date: string;
  scheduled: number;
  needed: number;
}

/** Scheduled vs needed per date of a request. */
export function coverage(req: GrabRequest, shifts: Shift[]): DayCoverage[] {
  const live = shifts.filter((s) => s.requestId === req.id && isLive(s));
  return datesBetween(req.startDate, req.endDate).map((date) => ({
    date,
    scheduled: live.filter((s) => s.shiftDate === date).length,
    needed: req.headcount,
  }));
}

export type Ineligible = 'inactive' | 'not_field' | 'grade' | 'training' | 'busy';

export const INELIGIBLE_LABEL: Record<Ineligible, string> = {
  inactive: 'akun nonaktif',
  not_field: 'bukan SPG',
  grade: 'grade di bawah request',
  training: 'belum lulus training campaign',
  busy: 'sudah ada shift di tanggal ini',
};

/** Why an SPG cannot take a shift of this request on this date, or null when they can. */
export function whyNot(p: Profile, req: GrabRequest, date: string, trainings: Training[], shifts: Shift[]): Ineligible | null {
  if (!p.active) return 'inactive';
  if (p.role !== 'spg' && p.role !== 'coordinator') return 'not_field';
  if (!p.grade || GRADE_RANK[p.grade] < GRADE_RANK[req.grade]) return 'grade';
  if (!trainings.some((t) => t.spgId === p.id && t.campaignId === req.campaignId)) return 'training';
  // A no-show still holds the day (shifts_one_live_per_spg_day), so it counts as busy too.
  if (shifts.some((s) => s.spgId === p.id && s.shiftDate === date && isLive(s))) return 'busy';
  return null;
}

/** Field workers sorted for a request: same city first, then by grade, then name. */
export function candidates(profiles: Profile[], req: GrabRequest): Profile[] {
  return profiles
    .filter((p) => p.role === 'spg' || p.role === 'coordinator')
    .sort(
      (a, b) =>
        Number(b.cityId === req.cityId) - Number(a.cityId === req.cityId) ||
        (b.grade ? GRADE_RANK[b.grade] : 0) - (a.grade ? GRADE_RANK[a.grade] : 0) ||
        a.name.localeCompare(b.name),
    );
}

export type SlaState = 'met' | 'missed' | 'open' | 'breached';

/** Hiring SLA: met/missed once staffed, else open until the due time passes. */
export function hiringSla(req: Pick<GrabRequest, 'slaHiringDue' | 'staffedAt' | 'status'>, now: number): SlaState {
  if (req.staffedAt != null) return req.slaHiringDue != null && req.staffedAt > req.slaHiringDue ? 'missed' : 'met';
  if (req.status === 'cancelled') return 'met';
  return req.slaHiringDue != null && now > req.slaHiringDue ? 'breached' : 'open';
}

/** Default shift hours by package length: 8-hour shift 09:00–17:00, 10-hour 09:00–19:00. */
export function defaultTimes(shiftHours: 8 | 10): { start: string; end: string } {
  return { start: '09:00', end: shiftHours === 10 ? '19:00' : '17:00' };
}

/** HH:MM validation for the time fields. */
export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
