import { C } from '../../theme';
import type { RequestStatus, Replacement } from '../../types';
import type { SlaState } from '../../utils/roster';

export const REQUEST_STATUS: Record<RequestStatus, { label: string; color: string }> = {
  new: { label: 'Baru', color: C.info },
  staffed: { label: 'Terisi', color: C.ok },
  running: { label: 'Berjalan', color: C.teal },
  closed: { label: 'Selesai', color: C.muted },
  cancelled: { label: 'Dibatalkan', color: C.muted },
};

export const SLA_META: Record<SlaState, { label: string; color: string }> = {
  open: { label: 'berjalan', color: C.info },
  breached: { label: 'TERLEWAT', color: C.accent },
  met: { label: 'tercapai', color: C.ok },
  missed: { label: 'terlambat', color: C.warn },
};

export const REPLACEMENT_REASON: Record<Replacement['reason'], string> = {
  no_show: 'Tidak hadir',
  resignation: 'Mengundurkan diri',
  underperform: 'Kinerja kurang',
};

export const PACKAGE_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan (PKWT)' } as const;
