/**
 * True when a caught DB error is a UNIQUE-constraint violation (duplicate code/name).
 * Lets master-data forms redirect with a friendly "already exists" message instead
 * of surfacing the raw Next.js server-action error page.
 */
export function isUniqueViolation(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? "");
  const code = String((e as { code?: string })?.code ?? "");
  return /UNIQUE constraint failed/i.test(msg) || code === "SQLITE_CONSTRAINT_UNIQUE";
}
