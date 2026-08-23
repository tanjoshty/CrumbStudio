import { describe, expect, it } from "vitest"

import {
  formatWeekdays,
  isDateKey,
  parseMaxItems,
  weekStartOf,
} from "./week"

describe("weekStartOf", () => {
  it("snaps any day to its Monday", () => {
    // 2026-08-26 is a Wednesday; its Monday is 2026-08-24.
    expect(weekStartOf("2026-08-26")).toBe("2026-08-24")
    expect(weekStartOf("2026-08-24")).toBe("2026-08-24") // Monday stays put
    expect(weekStartOf("2026-08-30")).toBe("2026-08-24") // Sunday → same Monday
  })
})

describe("formatWeekdays", () => {
  it("collapses contiguous runs to ranges", () => {
    expect(formatWeekdays([0, 1, 2, 3])).toBe("Mon–Thu")
    expect(formatWeekdays([4])).toBe("Fri")
    expect(formatWeekdays([5])).toBe("Sat")
  })
  it("keeps non-contiguous groups separate and sorts", () => {
    expect(formatWeekdays([3, 0, 1])).toBe("Mon–Tue, Thu")
    expect(formatWeekdays([0, 6])).toBe("Mon, Sun")
  })
  it("handles empty", () => {
    expect(formatWeekdays([])).toBe("—")
  })
})

describe("parseMaxItems", () => {
  it("accepts non-negative integers", () => {
    expect(parseMaxItems("0")).toBe(0)
    expect(parseMaxItems(" 3 ")).toBe(3)
  })
  it("rejects negatives, decimals and junk", () => {
    expect(parseMaxItems("-1")).toBeNull()
    expect(parseMaxItems("2.5")).toBeNull()
    expect(parseMaxItems("")).toBeNull()
    expect(parseMaxItems("abc")).toBeNull()
  })
})

describe("isDateKey", () => {
  it("accepts yyyy-MM-dd and rejects anything else", () => {
    expect(isDateKey("2026-08-24")).toBe(true)
    expect(isDateKey("2026-8-24")).toBe(false)
    expect(isDateKey("not-a-date")).toBe(false)
    expect(isDateKey("")).toBe(false)
  })
})
