/**
 * Rows for the CSV exports: attendance detail (Grab + payroll), and the billing recap that the
 * monthly invoice is reconciled against (R13, R15). Pure — unit-tested in plain Node.
 * All clock times are WIB, the programme clock.
 */
import type { Attendance, Campaign, City, GrabRequest, KpiLog, Profile, Shift, ShiftException, Venue } from '../types';

const WIB_MS = 7 * 3600000;
export const wibClock = (ts: number | null | undefined) => (ts == null ? '' : new Date(ts + WIB_MS).toISOString().slice(11, 16));
const hours = (ms: number) => Math.round((ms / 3600000) * 100) / 100;

export interface ExportData {
  shifts: Shift[];
  requests: GrabRequest[];
  attendances: Attendance[];
  exceptions: ShiftException[];
  kpiLogs: KpiLog[];
  profiles: Profile[];
  venues: Venue[];
  cities: City[];
  campaigns: Campaign[];
}

/** A shift counts for the invoice only when done, validated and without an open exception (billable_shifts view). */
export function isBillable(s: Shift, exceptions: ShiftException[]): boolean {
  return s.status === 'done' && s.validatedAt != null && !exceptions.some((e) => e.shiftId === s.id && e.status === 'open');
}

/**
 * One row per shift in [from, to] (YYYY-MM-DD). `withPayroll` adds the columns payroll needs
 * (username, contract type, normal/overtime hours); the Grab export leaves them out.
 */
export function attendanceRows(d: ExportData, from: string, to: string, withPayroll: boolean): (string | number)[][] {
  const head = [
    'Tanggal', 'SPG', 'Grade', 'Kota', 'Venue', 'Campaign', 'Status shift', 'Jadwal mulai', 'Jadwal selesai',
    'Clock-in', 'Clock-out', 'Jam kerja', 'Di lokasi', 'Terlambat (menit)', 'Exception terbuka', 'Divalidasi PIC', 'Ditagihkan',
  ];
  const payHead = ['Username', 'Kontrak', 'Jam normal', 'Jam lembur'];
  const kpiKeys = [...new Set(d.kpiLogs.map((k) => k.fieldKey))].sort();
  const rows: (string | number)[][] = [[...head, ...kpiKeys.map((k) => `KPI ${k}`), ...(withPayroll ? payHead : [])]];

  const shifts = d.shifts
    .filter((s) => s.shiftDate >= from && s.shiftDate <= to && s.status !== 'cancelled' && s.status !== 'replaced')
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.plannedStart.localeCompare(b.plannedStart));

  for (const s of shifts) {
    const p = d.profiles.find((x) => x.id === s.spgId);
    const r = d.requests.find((x) => x.id === s.requestId);
    const v = d.venues.find((x) => x.id === s.venueId);
    const c = d.cities.find((x) => x.id === v?.cityId);
    const camp = d.campaigns.find((x) => x.id === r?.campaignId);
    const a = d.attendances.find((x) => x.shiftId === s.id);
    const open = d.exceptions.filter((e) => e.shiftId === s.id && e.status === 'open');
    const worked = a && a.clockOutAt ? hours(a.clockOutAt - a.clockInAt) : 0;
    const kpi = kpiKeys.map((k) =>
      d.kpiLogs.filter((x) => x.shiftId === s.id && x.fieldKey === k).reduce((sum, x) => sum + x.value, 0),
    );
    const row: (string | number)[] = [
      s.shiftDate, p?.name ?? s.spgId, p?.grade ?? '', c?.name ?? '', v?.name ?? '', camp?.name ?? '', s.status,
      s.plannedStart.slice(0, 5), s.plannedEnd.slice(0, 5), wibClock(a?.clockInAt), wibClock(a?.clockOutAt), worked,
      a ? (a.geoValid ? 'Ya' : 'Tidak') : '', a?.lateMin ?? '', open.length, s.validatedAt ? 'Ya' : 'Tidak',
      isBillable(s, d.exceptions) ? 'Ya' : 'Tidak', ...kpi,
    ];
    if (withPayroll) {
      const shiftHours = r?.shiftHours ?? 8;
      const paid = s.status === 'done';
      row.push(p?.username ?? '', p?.contractType ?? '', paid ? shiftHours - s.overtimeHours : 0, paid ? s.overtimeHours : 0);
    }
    rows.push(row);
  }
  return rows;
}

export interface BillingLine {
  city: string;
  grade: string;
  pkg: string;
  shiftHours: number;
  days: number;
  overtimeHours: number;
}

/** Validated SPG-days for a month (YYYY-MM), grouped the way the commercial template prices them. */
export function billingLines(d: ExportData, month: string): BillingLine[] {
  const map = new Map<string, BillingLine>();
  for (const s of d.shifts) {
    if (!s.shiftDate.startsWith(month) || !isBillable(s, d.exceptions)) continue;
    const r = d.requests.find((x) => x.id === s.requestId);
    if (!r) continue;
    const city = d.cities.find((c) => c.id === r.cityId)?.name ?? r.cityId;
    const key = [city, r.grade, r.package, r.shiftHours].join('|');
    const line = map.get(key) ?? { city, grade: r.grade, pkg: r.package, shiftHours: r.shiftHours, days: 0, overtimeHours: 0 };
    line.days += 1;
    line.overtimeHours += s.overtimeHours;
    map.set(key, line);
  }
  return [...map.values()].sort((a, b) => a.city.localeCompare(b.city) || a.grade.localeCompare(b.grade) || a.pkg.localeCompare(b.pkg));
}

export function billingRows(lines: BillingLine[]): (string | number)[][] {
  return [
    ['Kota', 'Grade', 'Paket', 'Jam per shift', 'SPG-hari tervalidasi', 'Total jam lembur'],
    ...lines.map((l) => [l.city, l.grade, l.pkg, l.shiftHours, l.days, l.overtimeHours]),
  ];
}
