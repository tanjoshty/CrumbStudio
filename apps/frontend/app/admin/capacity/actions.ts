"use server"

import { revalidatePath } from "next/cache"

import { isAdmin } from "@/lib/auth/admin"
import {
  addClosure,
  removeClosure,
  removeOverride,
  setPoolMax,
  upsertOverride,
} from "@/lib/capacity/admin"
import { isDateKey, parseMaxItems, weekStartOf } from "@/lib/capacity/week"
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

export async function addClosureAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  if (!(await requireAdmin())) return { ok: false, error: "Not authorised." }

  const date = String(formData.get("date") ?? "")
  const note = String(formData.get("note") ?? "").trim() || null
  if (!isDateKey(date)) return { ok: false, error: "Choose a date to close." }

  const result = await addClosure(date, note)
  if (!result.ok) return { ok: false, error: result.error }
  refresh()
  return { ok: true, message: "Date closed" }
}

export async function removeClosureAction(date: string): Promise<void> {
  if (!(await requireAdmin())) return
  await removeClosure(date)
  refresh()
}
