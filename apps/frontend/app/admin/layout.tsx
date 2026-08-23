import Link from "next/link"
import { redirect } from "next/navigation"

import { AdminNav } from "@/components/admin/AdminNav"
import { isAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Admin shell + the page-level authorisation fallback.
 *
 * `proxy.ts` is the gate; this re-checks at render time so a proxy
 * misconfiguration can't leak order data. Wraps every `/admin/*` page.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!isAdmin(data?.claims?.sub)) {
    redirect("/")
  }

  return (
    <div className="min-h-svh bg-cream text-ink">
      <header className="bg-ink">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/admin"
            className="font-display font-black text-xl text-cream uppercase tracking-[0.02em]"
          >
            CrumbStudio <span className="text-cream/50">Admin</span>
          </Link>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}
