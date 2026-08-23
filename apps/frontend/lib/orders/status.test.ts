import { describe, expect, it } from "vitest"

import {
  ACTIVE_STATUSES,
  allowedTransitions,
  canTransition,
  type OrderStatus,
} from "./status"

describe("order status state machine", () => {
  it("admin cannot touch a pending order", () => {
    expect(allowedTransitions("pending")).toEqual([])
  })

  it("moves forward one step at a time", () => {
    expect(canTransition("confirmed", "in_progress")).toBe(true)
    expect(canTransition("in_progress", "ready")).toBe(true)
    expect(canTransition("ready", "completed")).toBe(true)
  })

  it("cannot skip steps or go backwards", () => {
    expect(canTransition("confirmed", "ready")).toBe(false)
    expect(canTransition("confirmed", "completed")).toBe(false)
    expect(canTransition("ready", "in_progress")).toBe(false)
    expect(canTransition("in_progress", "confirmed")).toBe(false)
  })

  it("can cancel from any active state", () => {
    for (const s of ["confirmed", "in_progress", "ready"] as OrderStatus[]) {
      expect(canTransition(s, "cancelled")).toBe(true)
    }
  })

  it("terminal states have no transitions", () => {
    expect(allowedTransitions("completed")).toEqual([])
    expect(allowedTransitions("cancelled")).toEqual([])
  })

  it("cannot resurrect or re-confirm", () => {
    expect(canTransition("cancelled", "confirmed")).toBe(false)
    expect(canTransition("completed", "in_progress")).toBe(false)
    expect(canTransition("confirmed", "pending")).toBe(false)
  })

  it("active statuses are the bake-work ones", () => {
    expect(ACTIVE_STATUSES).toEqual(["confirmed", "in_progress", "ready"])
  })
})
