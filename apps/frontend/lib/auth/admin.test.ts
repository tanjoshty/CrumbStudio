import { describe, expect, it } from "vitest"

import { isAdmin, parseAdminIds } from "./admin"

describe("parseAdminIds", () => {
  it("splits, trims and drops empties", () => {
    expect(parseAdminIds(" a , b ,,c ")).toEqual(["a", "b", "c"])
  })
  it("returns [] for undefined/empty", () => {
    expect(parseAdminIds(undefined)).toEqual([])
    expect(parseAdminIds("")).toEqual([])
  })
})

describe("isAdmin", () => {
  const list = "923bd256-2af0-41f6-a6fb-5b123be006a0, other-id"

  it("allows a listed id", () => {
    expect(isAdmin("923bd256-2af0-41f6-a6fb-5b123be006a0", list)).toBe(true)
  })
  it("denies an unlisted id", () => {
    expect(isAdmin("some-customer-id", list)).toBe(false)
  })
  it("denies a missing sub", () => {
    expect(isAdmin(null, list)).toBe(false)
    expect(isAdmin(undefined, list)).toBe(false)
  })
  it("denies everyone when the list is empty", () => {
    expect(isAdmin("923bd256-2af0-41f6-a6fb-5b123be006a0", "")).toBe(false)
  })
})
