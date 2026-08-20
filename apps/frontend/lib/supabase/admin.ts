import { createClient } from "@supabase/supabase-js"

/**
 * Supabase client using the service-role key, which **bypasses RLS entirely**.
 *
 * Every table in `public` has RLS enabled with zero policies, so the
 * publishable key can read and write nothing — trusted server paths (capacity,
 * order placement, admin) go through here instead.
 *
 * Server-only. Never import this from a Client Component: the key grants full
 * read/write on the whole database, and bundling it would ship that to the
 * browser.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() was called in the browser. The service-role key must never leave the server."
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set both in apps/frontend/.env.local."
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
