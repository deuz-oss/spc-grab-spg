import { EXCEPTION_NOTE_MIN_LENGTH } from '../config';

/**
 * Why a note to close an exception would be refused, or null when it is fine. Same rule as the server
 * (resolve_exception, migration 0015), checked first so the PIC gets the message without a round trip.
 * Pure — unit-tested in Node.
 */
export function exceptionNoteProblem(note: string | undefined): string | null {
  const n = (note ?? '').trim().length;
  if (n >= EXCEPTION_NOTE_MIN_LENGTH) return null;
  return `Tulis apa yang dicek dan hasilnya, minimal ${EXCEPTION_NOTE_MIN_LENGTH} karakter (sekarang ${n}).`;
}
