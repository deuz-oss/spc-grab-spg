import { ExceptionType, Role } from './types';

export const APP_NAME = 'SPC Grab SPG';

/** Ignore route points that moved less than this (m), to save storage. */
export const TRACK_MIN_STEP_M = 8;
/** Minimum interval between GPS updates while a shift is running (ms). */
export const TRACK_INTERVAL_MS = 15000;

/** Field history loaded at login (days) — today, the week, and last month's recap. */
export const HISTORY_DAYS = 45;

/** Mirrors the server: late after 15 min, auto-close after 16 h (migrations 0001, 0003). */
export const LATE_THRESHOLD_MIN = 15;
export const AUTO_CLOSE_ATTENDANCE_HOURS = 16;

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  pic: 'PIC',
  back_office: 'Back Office',
  coordinator: 'Koordinator Kota',
  spg: 'SPG / SPB',
  grab_viewer: 'Grab (Read-only)',
};

/** Roles that see the whole programme (mirrors can_monitor() in SQL). */
export const MONITOR_ROLES: Role[] = ['super_admin', 'pic', 'back_office', 'grab_viewer'];
/** Roles that run operations: schedule, validate, resolve (mirrors is_ops()). */
export const OPS_ROLES: Role[] = ['super_admin', 'pic'];
/** Roles that do field work and record attendance. */
export const FIELD_ROLES: Role[] = ['spg', 'coordinator'];

export const EXCEPTION_LABEL: Record<ExceptionType, string> = {
  no_show: 'Tidak hadir',
  off_site: 'Di luar lokasi',
  late: 'Terlambat',
  short_shift: 'Shift kurang',
  late_sync: 'Data terlambat masuk',
  kpi_outlier: 'KPI tidak wajar',
  no_clock_out: 'Tidak clock-out',
};

/** Text shown before an SPG gives consent; bump CONSENT_VERSION whenever it changes. */
export const CONSENT_VERSION = '2026-10-v1';
export const CONSENT_TEXT =
  'Saya setuju PT Sinergi Performa Cipta memproses foto selfie, lokasi GPS selama shift, dan data KPI saya ' +
  'untuk absensi, pelaporan ke klien, dan penggajian. Data disimpan di server Singapura dan foto selfie serta ' +
  'riwayat lokasi dihapus otomatis setelah 12 bulan.';
