/**
 * Safe readers for query-string values.
 *
 * `parseInt(searchParams.get("limit") ?? "20")` has two failure modes the app
 * was hitting: `?limit=999999` pulls the whole table, and `?limit=abc` yields
 * NaN which Prisma rejects with a 500. Both are clamped here (audit M2).
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_PRICE_HISTORY_DAYS = 365;

/** Clamp a raw query value to an integer inside [min, max]. */
export function clampInt(
  raw: string | null | undefined,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (raw === null || raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** `?limit=` — 1..100, default 20. */
export const parseLimit = (raw: string | null | undefined, fallback = DEFAULT_PAGE_SIZE) =>
  clampInt(raw, { min: 1, max: MAX_PAGE_SIZE, fallback });

/** `?page=` — 1-based, capped so `skip` can't overflow. */
export const parsePage = (raw: string | null | undefined) =>
  clampInt(raw, { min: 1, max: 10_000, fallback: 1 });

/** `?page=`/`?limit=` together, with the derived `skip`. */
export function parsePagination(searchParams: URLSearchParams) {
  const page = parsePage(searchParams.get("page"));
  const limit = parseLimit(searchParams.get("limit"));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * `?range=` on price-history endpoints.
 *
 * `all` previously mapped to 9999 days — effectively unbounded. It is capped
 * at one year, which is also all the retention the data has.
 */
export function parseRangeDays(raw: string | null | undefined): number {
  switch ((raw ?? "30").toLowerCase()) {
    case "7d":
    case "7":
      return 7;
    case "30d":
    case "30":
      return 30;
    case "90d":
    case "90":
      return 90;
    case "1y":
    case "365":
    case "all":
      return MAX_PRICE_HISTORY_DAYS;
    default:
      return clampInt(raw, { min: 1, max: MAX_PRICE_HISTORY_DAYS, fallback: 30 });
  }
}
