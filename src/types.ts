/** Domain model — mirrors supabase/migrations/0001_grab_schema.sql (timestamps as epoch ms). */

export type Role = 'super_admin' | 'pic' | 'back_office' | 'coordinator' | 'spg' | 'grab_viewer';
export type Grade = 'A' | 'B' | 'C';

export interface Profile {
  id: string;
  name: string;
  username: string;
  role: Role;
  cityId: string | null;
  active: boolean;
  grade: Grade | null;
  contractType: 'daily_worker' | 'pkwt' | null;
  documentsOk: boolean;
  phoneOk: boolean;
  bpjsRegistered: boolean;
  consentVersion: string | null;
  consentAt: number | null;
  photoPath: string | null;
}

export interface City {
  id: string;
  name: string;
  province: string;
  capability: 'Strong' | 'Weak';
}

export interface Venue {
  id: string;
  cityId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface KpiField {
  key: string;
  label: string;
  unit: string;
  proof_required: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  type: 'user' | 'merchant' | 'driver' | 'launch' | 'event';
  kpiFields: KpiField[];
  active: boolean;
}

export type RequestStatus = 'new' | 'staffed' | 'running' | 'closed' | 'cancelled';

export interface GrabRequest {
  id: string;
  campaignId: string;
  cityId: string;
  venueId: string;
  grade: Grade;
  headcount: number;
  startDate: string; // YYYY-MM-DD (WIB)
  endDate: string;
  shiftHours: 8 | 10;
  package: 'daily' | 'weekly' | 'monthly';
  status: RequestStatus;
  submittedAt: number;
  slaHiringDue: number | null;
  staffedAt: number | null;
  notes: string;
}

export type ShiftStatus = 'planned' | 'done' | 'no_show' | 'replaced' | 'cancelled';

export interface Shift {
  id: string;
  requestId: string;
  venueId: string;
  spgId: string;
  shiftDate: string; // YYYY-MM-DD (WIB)
  plannedStart: string; // HH:MM:SS
  plannedEnd: string;
  overtimeHours: number;
  status: ShiftStatus;
  validatedAt: number | null;
  replacesShiftId: string | null;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  t: number;
}

export interface Attendance {
  id: string;
  shiftId: string;
  userId: string;
  clockInAt: number;
  clockInLat: number;
  clockInLng: number;
  mocked: boolean;
  /** Server-computed; null until the server has the row (queued offline). */
  geoValid: boolean | null;
  distanceM: number | null;
  lateMin: number | null;
  clockOutAt: number | null;
  autoClosed: boolean;
  /** Last known route points on this device (for the tracking context). */
  route: RoutePoint[];
  /** Still waiting in the offline queue. */
  pending?: boolean;
}

export interface KpiLog {
  id: string;
  shiftId: string;
  spgId: string;
  fieldKey: string;
  value: number;
  proofPath: string | null;
  loggedAt: number;
  pending?: boolean;
}

export type ExceptionType = 'no_show' | 'off_site' | 'late' | 'short_shift' | 'late_sync' | 'kpi_outlier' | 'no_clock_out';

export interface ShiftException {
  id: number;
  shiftId: string;
  type: ExceptionType;
  detail: string;
  detectedAt: number;
  status: 'open' | 'resolved' | 'waived';
  note: string;
}

export interface Training {
  id: string;
  spgId: string;
  campaignId: string;
  passedAt: number;
  score: number | null;
}

export interface Replacement {
  id: string;
  originalShiftId: string;
  reason: 'no_show' | 'resignation' | 'underperform';
  requestedAt: number;
  dueAt: number;
  filledShiftId: string | null;
  filledAt: number | null;
}

export interface DailyReportTotals {
  planned: number;
  attended: number;
  no_show: number;
  geo_valid: number;
  open_exceptions: number;
  kpi: Record<string, number>;
}

export interface DailyReport {
  date: string; // YYYY-MM-DD (WIB)
  generatedAt: number;
  publishedAt: number | null;
  totals: DailyReportTotals;
}

export interface LivePosition {
  userId: string;
  name: string;
  shiftId: string;
  venueId: string;
  lat: number;
  lng: number;
  at: number;
}
