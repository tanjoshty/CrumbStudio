import { describe, expect, it } from "vitest"

import { capacityMessage, holdErrorToMessage } from "./errors"

describe("capacityMessage", () => {
  it("leads with the notice period when a date is too soon", () => {
    // The most actionable failure: they can fix it precisely.
    const message = capacityMessage([
      { date: "2026-08-21", requested: 1, remaining: 0, reason: "too_soon" },
      { date: "2026-08-29", requested: 1, remaining: 0, reason: "closed" },
    ])
    expect(message).toContain("5 days")
  })

  it("says we are not baking when every failure is a closure", () => {
    const message = capacityMessage([
      { date: "2026-08-29", requested: 1, remaining: 0, reason: "closed" },
    ])
    expect(message).toContain("not baking")
  })

  it("says booked out when capacity is the problem", () => {
    const message = capacityMessage([
      { date: "2026-09-01", requested: 1, remaining: 0, reason: "full" },
    ])
    expect(message).toContain("booked out")
  })

  it("does not claim a closure when only some dates are closed", () => {
    const message = capacityMessage([
      { date: "2026-08-29", requested: 1, remaining: 0, reason: "closed" },
      { date: "2026-09-01", requested: 1, remaining: 0, reason: "full" },
    ])
    expect(message).toContain("booked out")
  })
})

describe("holdErrorToMessage", () => {
  it("maps a lost capacity race to a retryable date error", () => {
    expect(holdErrorToMessage("CAPACITY_FULL:mon_thu:2026-08-31")).toEqual({
      code: "DATE_UNAVAILABLE",
      message: "That date has just been booked out. Please choose another.",
    })
  })

  it("maps a closure raised inside the lock", () => {
    expect(holdErrorToMessage("DATE_CLOSED:2026-08-29").code).toBe(
      "DATE_UNAVAILABLE"
    )
  })

  it("maps an unmapped weekday", () => {
    expect(holdErrorToMessage("UNKNOWN_DATE:2026-08-29").code).toBe(
      "DATE_UNAVAILABLE"
    )
  })

  it("treats an unrecognised failure as ours, not the customer's", () => {
    // Blaming the date for a connection error would send someone to rebook a
    // slot that was never the problem.
    expect(holdErrorToMessage("connection reset by peer").code).toBe(
      "PAYMENT_SETUP_FAILED"
    )
  })

  it("treats an empty message as ours", () => {
    expect(holdErrorToMessage("").code).toBe("PAYMENT_SETUP_FAILED")
  })
})
