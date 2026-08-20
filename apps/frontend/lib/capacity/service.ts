import { createAdminClient } from "@/lib/supabase/admin"
import {
  decideDay,
  earliestBookableDate,
  parseDateKey,
  spendCapacity,
  toDateKey,
  type AvailabilityRow,
  type CapacityCheck,
  type CartCapacityItem,
  type DayAvailability,
} from "./rules"

export type {
  CapacityCheck,
  CartCapacityItem,
  DayAvailability,
  UnavailableReason,
} from "./rules"
export { earliestBookableDate } from "./rules"

/**
 * Capacity is counted **per week, per pool** — not per day.
 *
 * `capacity_pool.max_items` is a weekly count; `weekly_capacity` maps each
 * weekday to a pool, so weekdays sharing a pool share one weekly allowance
 * (Mon–Thu currently share a single cake between them). `capacity_override`
 * replaces a pool's count for one week; `date_closure` closes a date outright.
 *
 * The counting lives in SQL (`db/functions.sql`), not here. Reserving the last
 * slot is a read-then-write race that has to be settled inside one transaction,
 * and PostgREST cannot express `SELECT … FOR UPDATE` — so `place_order_hold`
 * does the authoritative check in the database. This module reads through the
 * *same* `capacity_availability` function, so the calendar and the reservation
 * can never disagree about what "full" means.
 *
 * This file is the IO shell; the decisions are in `rules.ts`.
 */

/**
 * Per-date availability across `[from, to]` inclusive.
 *
 * The SQL function reads bookings across whole ISO weeks even when the range
 * cuts through one — a pool's allowance is weekly, so a Monday booking outside
 * the range still consumes the slot a Wednesday inside it would need.
 */
export async function getAvailability(
  from: string,
  to: string
): Promise<DayAvailability[]> {
  const fromDate = parseDateKey(from, "from")
  const toDate = parseDateKey(to, "to")

  if (fromDate > toDate) {
    throw new Error(`from (${from}) must not be after to (${to})`)
  }

  const db = createAdminClient()
  const { data, error } = await db.rpc("capacity_availability", {
    p_from: from,
    p_to: to,
  })

  if (error) throw new Error(`Failed to load availability: ${error.message}`)

  const earliest = toDateKey(earliestBookableDate())
  return ((data ?? []) as AvailabilityRow[]).map((row) => decideDay(row, earliest))
}

/**
 * Checks a whole cart at once.
 *
 * This is a *pre*-check, for good error messages before taking a payment. It
 * holds nothing — `place_order_hold` re-checks under an advisory lock, and that
 * is the answer that counts.
 */
export async function checkCapacity(
  items: CartCapacityItem[]
): Promise<CapacityCheck> {
  if (items.length === 0) return { ok: true }

  const dates = items.map((item) =>
    parseDateKey(item.fulfillmentDate, "fulfillmentDate")
  )
  const from = toDateKey(new Date(Math.min(...dates.map((d) => d.getTime()))))
  const to = toDateKey(new Date(Math.max(...dates.map((d) => d.getTime()))))

  return spendCapacity(items, await getAvailability(from, to))
}
