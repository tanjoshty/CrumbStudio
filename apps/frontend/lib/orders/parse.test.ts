import { describe, expect, it } from "vitest"

import { MAX_ITEMS, parseCheckoutItems } from "./parse"

const VALID = {
  productId: "cake-1",
  sizeKey: "k6",
  fulfillmentDate: "2026-09-01",
  variations: { size: "6 inch", flavour: "Vanilla", colour: "Cobalt" },
  notes: "Happy 30th",
}

describe("parseCheckoutItems", () => {
  it("accepts a well-formed cart", () => {
    const items = parseCheckoutItems([VALID])
    expect(items).toHaveLength(1)
    expect(items![0]).toMatchObject({
      productId: "cake-1",
      sizeKey: "k6",
      fulfillmentDate: "2026-09-01",
    })
  })

  it("drops anything money-shaped the client sent", () => {
    // Prices are the server's to decide; a `price` in the payload must not
    // survive into the order, tampered or not.
    const items = parseCheckoutItems([{ ...VALID, price: 1, total: 1 }])
    expect(items![0]).not.toHaveProperty("price")
    expect(items![0]).not.toHaveProperty("total")
  })

  it.each([
    ["not an array", { productId: "x" }],
    ["an empty cart", []],
    ["a null entry", [null]],
    ["a string entry", ["cake"]],
    ["a missing productId", [{ ...VALID, productId: undefined }]],
    ["an empty productId", [{ ...VALID, productId: "" }]],
    ["a missing sizeKey", [{ ...VALID, sizeKey: undefined }]],
    ["an empty sizeKey", [{ ...VALID, sizeKey: "" }]],
    ["a numeric productId", [{ ...VALID, productId: 42 }]],
  ])("rejects %s", (_label, input) => {
    expect(parseCheckoutItems(input)).toBeNull()
  })

  it.each([
    ["a human-readable date", "Wed Sep 01 2026"],
    ["an ISO datetime", "2026-09-01T00:00:00.000Z"],
    ["a slashed date", "2026/09/01"],
    ["a short year", "26-09-01"],
    ["an empty string", ""],
  ])("rejects %s as a fulfilment date", (_label, date) => {
    // The date goes straight to a Postgres `date` column and into capacity
    // arithmetic; only yyyy-MM-dd is meaningful there.
    expect(parseCheckoutItems([{ ...VALID, fulfillmentDate: date }])).toBeNull()
  })

  it("rejects the whole cart when one line is malformed", () => {
    // A partial order is worse than a refused one: the customer would pay for
    // a cart they did not build.
    expect(parseCheckoutItems([VALID, { ...VALID, sizeKey: "" }])).toBeNull()
  })

  it("accepts a cart at the item limit and rejects one over", () => {
    const atLimit = Array.from({ length: MAX_ITEMS }, () => VALID)
    expect(parseCheckoutItems(atLimit)).toHaveLength(MAX_ITEMS)
    expect(parseCheckoutItems([...atLimit, VALID])).toBeNull()
  })

  it("treats missing optional fields as undefined, not empty strings", () => {
    const items = parseCheckoutItems([
      { productId: "c", sizeKey: "k", fulfillmentDate: "2026-09-01" },
    ])
    expect(items![0].variations).toEqual({
      size: undefined,
      flavour: undefined,
      colour: undefined,
    })
    expect(items![0].notes).toBeUndefined()
  })

  it("survives a non-object variations field", () => {
    const items = parseCheckoutItems([{ ...VALID, variations: "nope" }])
    expect(items![0].variations.size).toBeUndefined()
  })
})
