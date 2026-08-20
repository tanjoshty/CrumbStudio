import { describe, expect, it } from "vitest"

import {
  decideDay,
  spendCapacity,
  type AvailabilityRow,
  type DayAvailability,
} from "./rules"

/** An open Tuesday in the mon_thu pool, one slot free, unless overridden. */
function row(over: Partial<AvailabilityRow> = {}): AvailabilityRow {
  return {
    date: "2026-09-01",
    pool_key: "mon_thu",
    week_start: "2026-08-31",
    remaining: 1,
    closed: false,
    ...over,
  }
}

function day(over: Partial<DayAvailability> = {}): DayAvailability {
  return {
    date: "2026-09-01",
    remaining: 1,
    unavailable: false,
    reason: null,
    poolKey: "mon_thu",
    weekStart: "2026-08-31",
    ...over,
  }
}

describe("decideDay", () => {
  const earliest = "2026-08-25"

  it("reports an open date with room as bookable", () => {
    expect(decideDay(row(), earliest)).toMatchObject({
      remaining: 1,
      unavailable: false,
      reason: null,
    })
  })

  it("reports a date whose pool-week is used up as full", () => {
    expect(decideDay(row({ remaining: 0 }), earliest)).toMatchObject({
      unavailable: true,
      reason: "full",
    })
  })

  it("reports an explicitly closed date as closed even with capacity free", () => {
    expect(decideDay(row({ closed: true, remaining: 3 }), earliest)).toMatchObject({
      remaining: 0,
      unavailable: true,
      reason: "closed",
    })
  })

  it("reports a date inside the notice period as too_soon", () => {
    expect(decideDay(row({ date: "2026-08-24" }), earliest)).toMatchObject({
      unavailable: true,
      reason: "too_soon",
    })
  })

  it("treats the earliest bookable date itself as available", () => {
    expect(decideDay(row({ date: earliest }), earliest).unavailable).toBe(false)
  })

  it("prefers 'closed' over 'too_soon' when both apply", () => {
    // Closure is the reason that will still be true tomorrow, so it is the more
    // useful thing to tell someone.
    const result = decideDay(row({ date: "2026-08-24", closed: true }), earliest)
    expect(result.reason).toBe("closed")
  })

  it("treats a weekday with no pool mapped as closed, never as unlimited", () => {
    // An incomplete weekly_capacity table must not open the calendar up.
    expect(decideDay(row({ pool_key: null }), earliest)).toMatchObject({
      remaining: 0,
      unavailable: true,
      reason: "closed",
    })
  })
})

describe("spendCapacity", () => {
  it("passes an empty cart", () => {
    expect(spendCapacity([], [])).toEqual({ ok: true })
  })

  it("passes a cart that fits", () => {
    const availability = [day({ date: "2026-09-01", remaining: 1 })]
    const result = spendCapacity(
      [{ fulfillmentDate: "2026-09-01", quantity: 1 }],
      availability
    )
    expect(result.ok).toBe(true)
  })

  it("rejects a single line over the remaining count", () => {
    const availability = [day({ date: "2026-09-01", remaining: 1 })]
    const result = spendCapacity(
      [{ fulfillmentDate: "2026-09-01", quantity: 2 }],
      availability
    )
    expect(result).toMatchObject({
      ok: false,
      failures: [{ date: "2026-09-01", requested: 2, remaining: 1, reason: "full" }],
    })
  })

  it("sums separate lines that share one date", () => {
    // Two lines of 1 on a 1-slot date is 2 requested, not two independent 1s.
    const availability = [day({ date: "2026-09-01", remaining: 1 })]
    const result = spendCapacity(
      [
        { fulfillmentDate: "2026-09-01", quantity: 1 },
        { fulfillmentDate: "2026-09-01", quantity: 1 },
      ],
      availability
    )
    expect(result).toMatchObject({
      ok: false,
      failures: [{ requested: 2, remaining: 1 }],
    })
  })

  it("makes dates in one pool-week compete for the same slot", () => {
    // The bug this function exists for: Tuesday and Wednesday each report one
    // slot free, but Mon–Thu share a single weekly allowance between them.
    const availability = [
      day({ date: "2026-09-01", remaining: 1, poolKey: "mon_thu", weekStart: "2026-08-31" }),
      day({ date: "2026-09-02", remaining: 1, poolKey: "mon_thu", weekStart: "2026-08-31" }),
    ]
    const result = spendCapacity(
      [
        { fulfillmentDate: "2026-09-01", quantity: 1 },
        { fulfillmentDate: "2026-09-02", quantity: 1 },
      ],
      availability
    )
    expect(result.ok).toBe(false)
  })

  it("lets dates in different pools coexist in one week", () => {
    const availability = [
      day({ date: "2026-09-01", remaining: 1, poolKey: "mon_thu", weekStart: "2026-08-31" }),
      day({ date: "2026-09-04", remaining: 2, poolKey: "fri", weekStart: "2026-08-31" }),
      day({ date: "2026-09-05", remaining: 3, poolKey: "sat", weekStart: "2026-08-31" }),
    ]
    const result = spendCapacity(
      [
        { fulfillmentDate: "2026-09-01", quantity: 1 },
        { fulfillmentDate: "2026-09-04", quantity: 1 },
        { fulfillmentDate: "2026-09-05", quantity: 1 },
      ],
      availability
    )
    expect(result.ok).toBe(true)
  })

  it("lets the same pool in different weeks coexist", () => {
    const availability = [
      day({ date: "2026-09-01", remaining: 1, poolKey: "mon_thu", weekStart: "2026-08-31" }),
      day({ date: "2026-09-08", remaining: 1, poolKey: "mon_thu", weekStart: "2026-09-07" }),
    ]
    const result = spendCapacity(
      [
        { fulfillmentDate: "2026-09-01", quantity: 1 },
        { fulfillmentDate: "2026-09-08", quantity: 1 },
      ],
      availability
    )
    expect(result.ok).toBe(true)
  })

  it("fills a pool-week exactly without rejecting", () => {
    const availability = [
      day({ date: "2026-09-04", remaining: 2, poolKey: "fri", weekStart: "2026-08-31" }),
    ]
    const result = spendCapacity(
      [{ fulfillmentDate: "2026-09-04", quantity: 2 }],
      availability
    )
    expect(result.ok).toBe(true)
  })

  it("reports a closed date with its own reason, not as full", () => {
    const availability = [
      day({ date: "2026-09-05", remaining: 0, unavailable: true, reason: "closed" }),
    ]
    const result = spendCapacity(
      [{ fulfillmentDate: "2026-09-05", quantity: 1 }],
      availability
    )
    expect(result).toMatchObject({ ok: false, failures: [{ reason: "closed" }] })
  })

  it("rejects a date it has no availability row for", () => {
    // Missing data must never read as permission.
    const result = spendCapacity(
      [{ fulfillmentDate: "2099-01-01", quantity: 1 }],
      []
    )
    expect(result).toMatchObject({ ok: false, failures: [{ reason: "closed" }] })
  })

  it("reports every offending date, not just the first", () => {
    const availability = [
      day({ date: "2026-09-04", remaining: 0, unavailable: true, reason: "full" }),
      day({ date: "2026-09-05", remaining: 0, unavailable: true, reason: "closed" }),
    ]
    const result = spendCapacity(
      [
        { fulfillmentDate: "2026-09-04", quantity: 1 },
        { fulfillmentDate: "2026-09-05", quantity: 1 },
      ],
      availability
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failures).toHaveLength(2)
  })
})
