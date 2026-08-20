import {
  addDays,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  getISODay,
  isValid,
  parseISO,
  startOfISOWeek,
} from "date-fns"

import { createAdminClient } from "@/lib/supabase/admin"
import { MIN_NOTICE_DAYS } from "./constants"

/**
 * Capacity is counted **per week, per pool** — not per day.
 *
 * `capacity_pool.max_items` is a weekly count; `weekly_capacity` maps each
 * weekday to a pool, so weekdays sharing a pool share one weekly allowance
 * (Mon–Thu currently share a single cake between them). `capacity_override`
 * replaces a pool's count for one week; `date_closure` closes a date outright.
 *
 * A date is bookable iff it is open, past the notice period, and its pool still
 * has room that week.
 */

/** Order statuses that consume a capacity slot. `cancelled` never does. */
const CAPACITY_CONSUMING_STATUSES = [
  "pending",
  "confirmed",
  "in_progress",
  "ready",
  "completed",
] as const

/** Why a date cannot be booked. `null` when it can. */
export type UnavailableReason = "closed" | "too_soon" | "full"

export interface DayAvailability {
  /** `yyyy-MM-dd`. */
  date: string
  /** Slots left in this date's pool-week. `0` when closed or too soon. */
  remaining: number
  /** True when the date cannot be booked, for any reason. */
  unavailable: boolean
  reason: UnavailableReason | null
  /** The pool this date draws from; `null` if no weekday mapping exists. */
  poolKey: string | null
  /** Monday of this date's ISO week — the period `remaining` is measured over. */
  weekStart: string
}

export interface CartCapacityItem {
  /** `yyyy-MM-dd`. */
  fulfillmentDate: string
  quantity: number
}

export type CapacityCheck =
  | { ok: true }
  | {
      ok: false
      failures: {
        date: string
        requested: number
        remaining: number
        reason: UnavailableReason
      }[]
    }

/** `yyyy-MM-dd`, the only date format that crosses this module's boundaries. */
const toKey = (d: Date) => format(d, "yyyy-MM-dd")

/** 0 = Mon … 6 = Sun, matching `weekly_capacity.day_of_week`. */
const dayIndex = (d: Date) => getISODay(d) - 1

/** Pool-week identity: a pool's allowance is shared across one ISO week. */
const weekKey = (poolKey: string, day: Date) =>
  `${poolKey}|${toKey(startOfISOWeek(day))}`

/**
 * Parses a `yyyy-MM-dd` string as a *local* date.
 *
 * `fulfillment_date` is a Postgres `date` — a calendar day with no timezone.
 * Everything here stays in local calendar days and formats back with `toKey`;
 * never call `toISOString()` on these, or a UTC shift will move dates across
 * midnight and silently book the wrong day.
 */
function parseDateKey(value: string, label: string): Date {
  const parsed = parseISO(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(parsed)) {
    throw new Error(`${label} must be a yyyy-MM-dd date, got "${value}"`)
  }
  return parsed
}

/** The earliest date a customer may book, inclusive. */
export function earliestBookableDate(today = new Date()): Date {
  return addDays(today, MIN_NOTICE_DAYS)
}

interface PoolForDay {
  poolKey: string
  maxItems: number
}

/**
 * Per-date availability across `[from, to]` inclusive.
 *
 * Bookings are read across whole ISO weeks even when the requested range cuts
 * through one — a pool's allowance is weekly, so a Monday booking outside the
 * range still consumes the slot a Wednesday inside it would need.
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

  // Bookings are counted over whole weeks; overrides are keyed by week start.
  const weekSpanStart = startOfISOWeek(fromDate)
  const weekSpanEnd = endOfISOWeek(toDate)

  // Bookings need the weekday→pool map to attribute a date to a pool, so pools
  // are loaded first and threaded through rather than re-queried.
  const pools = await loadPools(db)

  const [overrides, closures, booked] = await Promise.all([
    loadOverrides(db, weekSpanStart, startOfISOWeek(toDate)),
    loadClosures(db, fromDate, toDate),
    loadBookedByPoolWeek(db, weekSpanStart, weekSpanEnd, pools),
  ])

  const earliest = toKey(earliestBookableDate())

  return eachDayOfInterval({ start: fromDate, end: toDate }).map((day) => {
    const date = toKey(day)
    const weekStart = toKey(startOfISOWeek(day))
    const pool = pools.get(dayIndex(day))

    // A weekday with no pool mapped is not bookable. Treat it as closed rather
    // than as unlimited — an incomplete weekly_capacity table must never open
    // the calendar up.
    if (!pool) return unavailableDay(date, "closed", null, weekStart)
    if (closures.has(date))
      return unavailableDay(date, "closed", pool.poolKey, weekStart)
    if (date < earliest)
      return unavailableDay(date, "too_soon", pool.poolKey, weekStart)

    const key = weekKey(pool.poolKey, day)
    const max = overrides.get(key) ?? pool.maxItems
    const remaining = Math.max(0, max - (booked.get(key) ?? 0))

    return {
      date,
      remaining,
      unavailable: remaining === 0,
      reason: remaining === 0 ? ("full" as const) : null,
      poolKey: pool.poolKey,
      weekStart,
    }
  })
}

/**
 * Checks a whole cart at once.
 *
 * Deliberately not per-item: several lines can share a pool-week, and checking
 * them one at a time would let a two-cake cart slip into a one-slot week.
 */
export async function checkCapacity(
  items: CartCapacityItem[]
): Promise<CapacityCheck> {
  if (items.length === 0) return { ok: true }

  const dates = items.map((item) =>
    parseDateKey(item.fulfillmentDate, "fulfillmentDate")
  )
  const from = toKey(new Date(Math.min(...dates.map((d) => d.getTime()))))
  const to = toKey(new Date(Math.max(...dates.map((d) => d.getTime()))))

  const availability = new Map(
    (await getAvailability(from, to)).map((day) => [day.date, day])
  )

  // Sum by date first: two lines on the same date compete for one allowance.
  const requestedByDate = new Map<string, number>()
  for (const item of items) {
    requestedByDate.set(
      item.fulfillmentDate,
      (requestedByDate.get(item.fulfillmentDate) ?? 0) + item.quantity
    )
  }

  const failures: Extract<CapacityCheck, { ok: false }>["failures"] = []

  // Dates sharing a pool-week also compete with each other — Mon–Thu draw on one
  // allowance — so spend from a shared budget rather than reading `remaining`
  // fresh for each date.
  const spent = new Map<string, number>()

  for (const [date, requested] of requestedByDate) {
    const day = availability.get(date)
    if (!day || day.unavailable) {
      failures.push({
        date,
        requested,
        remaining: 0,
        reason: day?.reason ?? "closed",
      })
      continue
    }

    const key = `${day.poolKey}|${day.weekStart}`
    const alreadySpent = spent.get(key) ?? 0
    const remaining = day.remaining - alreadySpent

    if (requested > remaining) {
      failures.push({ date, requested, remaining, reason: "full" })
      continue
    }

    spent.set(key, alreadySpent + requested)
  }

  return failures.length > 0 ? { ok: false, failures } : { ok: true }
}

function unavailableDay(
  date: string,
  reason: UnavailableReason,
  poolKey: string | null,
  weekStart: string
): DayAvailability {
  return { date, remaining: 0, unavailable: true, reason, poolKey, weekStart }
}

type Db = ReturnType<typeof createAdminClient>

async function loadPools(db: Db): Promise<Map<number, PoolForDay>> {
  const { data, error } = await db
    .from("weekly_capacity")
    .select("day_of_week, pool_key, capacity_pool!inner(max_items)")

  if (error) throw new Error(`Failed to load capacity pools: ${error.message}`)

  return new Map(
    (data ?? []).map((row) => {
      // PostgREST types the embed as an array; an !inner join on a FK yields one.
      const pool = row.capacity_pool as unknown as { max_items: number }
      return [
        row.day_of_week as number,
        { poolKey: row.pool_key as string, maxItems: pool.max_items },
      ]
    })
  )
}

async function loadOverrides(
  db: Db,
  fromWeek: Date,
  toWeek: Date
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("capacity_override")
    .select("pool_key, week_start, max_items")
    .gte("week_start", toKey(fromWeek))
    .lte("week_start", toKey(toWeek))

  if (error)
    throw new Error(`Failed to load capacity overrides: ${error.message}`)

  return new Map(
    (data ?? []).map((row) => [
      `${row.pool_key}|${row.week_start}`,
      row.max_items as number,
    ])
  )
}

async function loadClosures(
  db: Db,
  from: Date,
  to: Date
): Promise<Set<string>> {
  const { data, error } = await db
    .from("date_closure")
    .select("date")
    .gte("date", toKey(from))
    .lte("date", toKey(to))

  if (error) throw new Error(`Failed to load date closures: ${error.message}`)

  return new Set((data ?? []).map((row) => row.date as string))
}

/**
 * Booked items per pool-week.
 *
 * `pending` orders are capacity holds written at checkout, so they count — but
 * only while unexpired. A hold whose `hold_expires_at` has passed frees its
 * slot here regardless of whether Stripe's `checkout.session.expired` webhook
 * ever arrived, which is what stops an abandoned checkout blocking a slot
 * forever.
 */
async function loadBookedByPoolWeek(
  db: Db,
  from: Date,
  to: Date,
  pools: Map<number, PoolForDay>
): Promise<Map<string, number>> {
  const { data: items, error: itemsError } = await db
    .from("order_item")
    .select("order_id, quantity, fulfillment_date")
    .gte("fulfillment_date", toKey(from))
    .lte("fulfillment_date", toKey(to))

  if (itemsError)
    throw new Error(`Failed to load booked items: ${itemsError.message}`)
  if (!items || items.length === 0) return new Map()

  const { data: orders, error: ordersError } = await db
    .from("order")
    .select("id, status, hold_expires_at")
    .in("id", [...new Set(items.map((item) => item.order_id as string))])
    .in("status", [...CAPACITY_CONSUMING_STATUSES])

  if (ordersError)
    throw new Error(`Failed to load orders: ${ordersError.message}`)

  const now = Date.now()
  const consuming = new Set(
    (orders ?? [])
      .filter((order) => {
        if (order.status !== "pending") return true
        // A pending order with no expiry is treated as live: better to hold a
        // slot wrongly than to sell one twice.
        if (!order.hold_expires_at) return true
        return new Date(order.hold_expires_at as string).getTime() > now
      })
      .map((order) => order.id as string)
  )

  const booked = new Map<string, number>()

  for (const item of items) {
    if (!consuming.has(item.order_id as string)) continue

    const day = parseDateKey(item.fulfillment_date as string, "fulfillment_date")
    const pool = pools.get(dayIndex(day))
    if (!pool) continue

    const key = weekKey(pool.poolKey, day)
    booked.set(key, (booked.get(key) ?? 0) + (item.quantity as number))
  }

  return booked
}
