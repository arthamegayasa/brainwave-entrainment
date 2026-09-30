/** Rows per request, within PostgREST's row cap (max_rows 1000). */
export const PAGE_ROWS = 500;

/**
 * Every row of a list query, fetched PAGE_ROWS at a time until a short page:
 * an unpaged select stops silently at PostgREST's max_rows. `page` must
 * order its rows stably (end with a unique column) so pages never overlap.
 * `T` is the shape the select string asks for; the untyped client cannot
 * infer it (it types every embedded row as an array), so callers name it,
 * and anything reaching the audio engine still passes sanitizeSession.
 */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: readonly unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw error;
    const pageRows = (data ?? []) as readonly T[]; // shape named by the caller's select, see above
    rows.push(...pageRows);
    if (pageRows.length < PAGE_ROWS) return rows;
  }
}
