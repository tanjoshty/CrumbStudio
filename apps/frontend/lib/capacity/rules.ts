import { addDays, format, isValid, parseISO } from "date-fns"

import { MIN_NOTICE_DAYS } from "./constants"

/**
 * The pure half of capacity: given rows from `capacity_availability` and a
 * cart, decide what is bookable. No IO — every database concern lives in
 * `service.ts`, which makes these rules directly testable and keeps the
 * arithmetic that matters out of reach of a mock.
 */

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

/** One row of `capacity_availability(from, to)`. */
export interface AvailabilityRow {
  date: string
  pool_key: string | null
  week_start: string
  remaining: number
  closed: boolean
}

/** `yyyy-MM-dd`, the only date format that crosses a module boundary here. */
export const toDateKey = (d: Date) => format(d, "yyyy-MM-dd")

/**
 * Parses a `yyyy-MM-dd` string as a *local* date.
 *
 * `fulfillment_date` is a Postgres `date` — a calendar day with no timezone.
 * Everything here stays in local calendar days and formats back with
 * `toDateKey`; never call `toISOString()` on these, or a UTC shift will move
 * dates across midnight and silently book the wrong day.
 */
export function parseDateKey(value: string, label: string): Date {
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

/**
 * Turns one availability row into a verdict.
 *
 * Order matters: a date that is both closed and inside the notice period
 * reports `closed`, because that is the reason that will still be true
 * tomorrow.
 */
export function decideDay(
  row: AvailabilityRow,
  earliest: string
): DayAvailability {
  const base = {
    date: row.date,
    poolKey: row.pool_key,
    weekStart: row.week_start,
  }

  // A weekday with no pool mapped is not bookable. Treat it as closed rather
  // than as unlimited — an incomplete weekly_capacity table must never open the
  // calendar up.
  if (row.pool_key === null || row.closed) {
    return { ...base, remaining: 0, unavailable: true, reason: "closed" }
  }
  if (row.date < earliest) {
    return { ...base, remaining: 0, unavailable: true, reason: "too_soon" }
  }

  return {
    ...base,
    remaining: row.remaining,
    unavailable: row.remaining === 0,
    reason: row.remaining === 0 ? "full" : null,
  }
}

/**
 * Spends a cart against known availability.
 *
 * Deliberately not per-item. Lines compete on two axes: several lines can share
 * one date, and several *dates* can share one pool-week — Mon–Thu draw on a
 * single weekly allowance. Checking each line against `remaining` in isolation
 * would admit a cart with one cake on Tuesday and one on Wednesday, because
 * each date honestly reports a slot free.
 */
export function spendCapacity(
  items: CartCapacityItem[],
  availability: DayAvailability[]
): CapacityCheck {
  if (items.length === 0) return { ok: true }

  const byDate = new Map(availability.map((day) => [day.date, day]))

  // Sum by date first: two lines on the same date compete for one allowance.
  const requestedByDate = new Map<string, number>()
  for (const item of items) {
    requestedByDate.set(
      item.fulfillmentDate,
      (requestedByDate.get(item.fulfillmentDate) ?? 0) + item.quantity
    )
  }

  const failures: Extract<CapacityCheck, { ok: false }>["failures"] = []
  const spent = new Map<string, number>()

  for (const [date, requested] of requestedByDate) {
    const day = byDate.get(date)
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
