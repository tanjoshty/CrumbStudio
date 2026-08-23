/**
 * Admin authorisation — an env allow-list of Supabase user ids.
 *
 * Per C7: no schema, no per-request DB round trip. `ADMIN_USER_IDS` is a
 * comma-separated list of JWT `sub`s; adding an admin costs a redeploy, which is
 * acceptable for one baker. Checked in `proxy.ts` (the gate) and again at the
 * page level (the fallback).
 */

/** Split the comma-separated env value into trimmed, non-empty ids. */
export function parseAdminIds(csv: string | undefined | null): string[] {
  return (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Is this user id on the allow-list? `csv` defaults to the env var so callers
 * can just pass a `sub`; tests pass the list explicitly.
 */
export function isAdmin(
  sub: string | null | undefined,
  csv: string | undefined | null = process.env.ADMIN_USER_IDS
): boolean {
  if (!sub) return false
  return parseAdminIds(csv).includes(sub)
}
