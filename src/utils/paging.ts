/**
 * PostgREST answers at most `max_rows` rows per request (1000 on Supabase) and says nothing when it
 * cuts a result short — a month of shifts for a national programme passes that easily, and the
 * billing / payroll exports were silently missing rows. Every list the app reads goes through here.
 * Pure (no Supabase import) so it is unit-tested in plain Node.
 */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/**
 * Reads every page of a query. `page(from, to)` must return the same query with `.range(from, to)`
 * and a deterministic `.order(...)` (rows would otherwise shift between pages). Stops at the first
 * short page, so PAGE_SIZE must not exceed the server's max_rows.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => Page<T>,
  size: number = PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: out, error };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return { data: out, error: null };
  }
}
