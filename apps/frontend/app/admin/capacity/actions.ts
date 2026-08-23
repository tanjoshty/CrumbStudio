"use server"

import { revalidatePath } from "next/cache"

import { isAdmin } from "@/lib/auth/admin"
import {
  addClosures,
  removeClosures,
  removeOverride,
  setPoolMax,
  upsertOverride,
} from "@/lib/capacity/admin"
import {
  expandDateRange,
  isDateKey,
  parseMaxItems,
  weekStartOf,
} from "@/lib/capacity/week"
import { createClient } from "@/lib/supabase/server"

export interface FormState {
  ok: boolean
  error?: string
  message?: string
}

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return isAdmin(data?.claims?.sub)
}

function refresh() {
  revalidatePath("/admin/capacity")
}

// ── Pools ─────────────────────────────────────────────────────────────────────

export async function setPoolMaxAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." }

  const poolKey = String(formData.get("poolKey") ?? "")
  const max = parseMaxItems(String(formData.get("maxItems") ?? ""))
  if (!poolKey) return { ok: false, error: "Missing pool." }
  if (max === null) {
    return { ok: false, error: "Count must be a whole number, 0 or more." }
  }

  const result = await setPoolMax(poolKey, max)
  if (!result.ok) return { ok: false, error: result.error }
  refresh()
  return { ok: true, message: "Saved" }
}

// ── Overrides ─────────────────────────────────────────────────────────────────

export async function addOverrideAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." }

  const poolKey = String(formData.get("poolKey") ?? "")
  const week = String(formData.get("week") ?? "")
  const max = parseMaxItems(String(formData.get("maxItems") ?? ""))
  const note = String(formData.get("note") ?? "").trim() || null

  if (!poolKey) return { ok: false, error: "Choose a pool." }
  if (!isDateKey(week)) return { ok: false, error: "Choose a week." }
  if (max === null) {
    return { ok: false, error: "Count must be a whole number, 0 or more." }
  }

  // Snap to the Monday the capacity counting keys on, so the override lines up
  // with the bookings it governs.
  const result = await upsertOverride(poolKey, weekStartOf(week), max, note)
  if (!result.ok) return { ok: false, error: result.error }
  refresh()
  return { ok: true, message: "Override saved" }
}

export async function removeOverrideAction(
  poolKey: string,
  weekStart: string
): Promise<void> {
  if (!(await requireAdmin())) return
  await removeOverride(poolKey, weekStart)
  refresh()
}

// ── Closures ──────────────────────────────────────────────────────────────────

// Guards a fat-fingered range from closing months of the calendar at once.
const MAX_CLOSURE_SPAN_DAYS = 120

export async function addClosureAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." }

  const from = String(formData.get("from") ?? "")
  const toRaw = String(formData.get("to") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim() || null

  if (!isDateKey(from)) return { ok: false, error: "Choose a start date." }
  const to = toRaw || from
  if (!isDateKey(to)) return { ok: false, error: "That end date isn't valid." }
  if (to < from) {
    return { ok: false, error: "The end date is before the start date." }
  }

  const dates = expandDateRange(from, to)
  if (dates.length > MAX_CLOSURE_SPAN_DAYS) {
    return {
      ok: false,
      error: `That's ${dates.length} days — close at most ${MAX_CLOSURE_SPAN_DAYS} at once.`,
    }
  }

  const result = await addClosures(dates, note)
  if (!result.ok) return { ok: false, error: result.error }
  refresh()
  return {
    ok: true,
    message:
      dates.length === 1 ? "Date closed" : `${dates.length} dates closed`,
  }
}

export async function removeClosuresAction(dates: string[]): Promise<void> {
  if (!(await requireAdmin())) return
  await removeClosures(dates)
  refresh()
}
