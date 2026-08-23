import "server-only"

import { addDays, format, parseISO } from "date-fns"

import { createAdminClient } from "@/lib/supabase/admin"
import { weekStartOf } from "./week"

/**
 * Capacity editor data layer.
 *
 * Reads and writes the three levers the baker controls: pool counts, per-week
 * overrides, and date closures. The weekday→pool *mapping* (`weekly_capacity`)
 * is fixed config, read here only to label pools. Service-role client (C3);
 * writes are validated by the caller and return a result rather than throwing.
 */

export interface PoolRow {
  key: string
  maxItems: number
  weekdays: number[] // 0 = Mon … 6 = Sun
}

export interface OverrideRow {
  poolKey: string
  weekStart: string // yyyy-MM-dd (a Monday)
  maxItems: number
  note: string | null
}

export interface ClosureRow {
  date: string
  note: string | null
}

export interface WeekDay {
  date: string
  poolKey: string | null
  remaining: number
  closed: boolean
}

type WriteResult = { ok: true } | { ok: false; error: string }

const todayKey = () => format(new Date(), "yyyy-MM-dd")

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getPools(): Promise<PoolRow[]> {
  const db = createAdminClient()

  const [{ data: pools, error: poolErr }, { data: map, error: mapErr }] =
    await Promise.all([
      db.from("capacity_pool").select("key, max_items").order("key"),
      db.from("weekly_capacity").select("day_of_week, pool_key"),
    ])

  if (poolErr) throw new Error(`Failed to load pools: ${poolErr.message}`)
  if (mapErr) throw new Error(`Failed to load weekday map: ${mapErr.message}`)

  const weekdaysByPool = new Map<string, number[]>()
  for (const row of map ?? []) {
    const list = weekdaysByPool.get(row.pool_key) ?? []
    list.push(row.day_of_week)
    weekdaysByPool.set(row.pool_key, list)
  }

  return (pools ?? []).map((p) => ({
    key: p.key,
    maxItems: p.max_items,
    weekdays: (weekdaysByPool.get(p.key) ?? []).sort((a, b) => a - b),
  }))
}

/** Upcoming overrides (this week onward), soonest first. */
export async function getOverrides(): Promise<OverrideRow[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("capacity_override")
    .select("pool_key, week_start, max_items, note")
    .gte("week_start", weekStartOf(todayKey()))
    .order("week_start")
    .order("pool_key")

  if (error) throw new Error(`Failed to load overrides: ${error.message}`)
  return (data ?? []).map((o) => ({
    poolKey: o.pool_key,
    weekStart: o.week_start,
    maxItems: o.max_items,
    note: o.note ?? null,
  }))
}

/** Upcoming closures (today onward), soonest first. */
export async function getClosures(): Promise<ClosureRow[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("date_closure")
    .select("date, note")
    .gte("date", todayKey())
    .order("date")

  if (error) throw new Error(`Failed to load closures: ${error.message}`)
  return (data ?? []).map((c) => ({ date: c.date, note: c.note ?? null }))
}

/**
 * The seven days of a week with their remaining slots — a read-back so the baker
 * can see the effect of a change. Uses the same `capacity_availability` the
 * storefront reads, so what shows here is what a customer would see (minus the
 * lead-time greying, which is not a capacity fact).
 */
export async function getWeekPreview(weekStart: string): Promise<WeekDay[]> {
  const db = createAdminClient()
  const monday = weekStartOf(weekStart)
  const sunday = format(addDays(parseISO(monday), 6), "yyyy-MM-dd")

  const { data, error } = await db.rpc("capacity_availability", {
    p_from: monday,
    p_to: sunday,
  })
  if (error) throw new Error(`Failed to load week preview: ${error.message}`)

  return (
    (data ?? []) as {
      date: string
      pool_key: string | null
      remaining: number
      closed: boolean
    }[]
  ).map((r) => ({
    date: r.date,
    poolKey: r.pool_key,
    remaining: r.remaining,
    closed: r.closed,
  }))
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function setPoolMax(
  poolKey: string,
  maxItems: number
): Promise<WriteResult> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("capacity_pool")
    .update({ max_items: maxItems })
    .eq("key", poolKey)
    .select("key")
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: "Unknown pool." }
  return { ok: true }
}

export async function upsertOverride(
  poolKey: string,
  weekStart: string,
  maxItems: number,
  note: string | null
): Promise<WriteResult> {
  const db = createAdminClient()
  const { error } = await db.from("capacity_override").upsert(
    { pool_key: poolKey, week_start: weekStart, max_items: maxItems, note },
    { onConflict: "pool_key,week_start" }
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeOverride(
  poolKey: string,
  weekStart: string
): Promise<WriteResult> {
  const db = createAdminClient()
  const { error } = await db
    .from("capacity_override")
    .delete()
    .eq("pool_key", poolKey)
    .eq("week_start", weekStart)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function addClosure(
  date: string,
  note: string | null
): Promise<WriteResult> {
  const db = createAdminClient()
  const { error } = await db
    .from("date_closure")
    .upsert({ date, note }, { onConflict: "date" })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removeClosure(date: string): Promise<WriteResult> {
  const db = createAdminClient()
  const { error } = await db.from("date_closure").delete().eq("date", date)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
