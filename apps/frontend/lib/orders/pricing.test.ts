import { describe, expect, it } from "vitest"

import { buildPricedLines, totalCents } from "./pricing"
import type { PlaceOrderItem, PricingProduct } from "./types"

const CAKE: PricingProduct = {
  _id: "cake-1",
  name: "Victoria Sponge",
  active: true,
  sizes: [
    { _key: "k6", label: "6 inch", price: 85 },
    { _key: "k8", label: "8 inch", price: 120 },
  ],
}

function item(over: Partial<PlaceOrderItem> = {}): PlaceOrderItem {
  return {
    productId: "cake-1",
    sizeKey: "k6",
    fulfillmentDate: "2026-09-01",
    variations: { size: "6 inch", flavour: "Vanilla" },
    ...over,
  }
}

describe("buildPricedLines", () => {
  it("prices a line from the catalogue, not from the client", () => {
    const { lines, unavailable } = buildPricedLines([item()], [CAKE])
    expect(unavailable).toEqual([])
    expect(lines[0]).toMatchObject({
      productId: "cake-1",
      productName: "Victoria Sponge",
      sizeLabel: "6 inch",
      unitAmountCents: 8500,
    })
  })

  it("prices by size _key, not by the label the client sent", () => {
    // The whole reason sizeKey exists: a stale or forged label must not pick
    // the price.
    const { lines } = buildPricedLines(
      [item({ sizeKey: "k8", variations: { size: "6 inch" } })],
      [CAKE]
    )
    expect(lines[0].unitAmountCents).toBe(12000)
    expect(lines[0].sizeLabel).toBe("8 inch")
  })

  it("snapshots the catalogue's size label, not the client's", () => {
    // The price is chosen by _key. If the label disagreed and we kept the
    // client's, the order would record a 6 inch cake charged at 8 inch prices
    // — and the baker bakes from this field.
    const { lines } = buildPricedLines(
      [item({ sizeKey: "k8", variations: { size: "6 inch", flavour: "Vanilla" } })],
      [CAKE]
    )
    expect(lines[0].variations.size).toBe("8 inch")
    expect(lines[0].unitAmountCents).toBe(12000)
  })

  it("preserves flavour and colour while correcting the size", () => {
    const { lines } = buildPricedLines(
      [item({ variations: { size: "wrong", flavour: "Lemon", colour: "Sage" } })],
      [CAKE]
    )
    expect(lines[0].variations).toEqual({
      size: "6 inch",
      flavour: "Lemon",
      colour: "Sage",
    })
  })

  it("rejects a product that is no longer in the catalogue", () => {
    const { lines, unavailable } = buildPricedLines([item()], [])
    expect(lines).toEqual([])
    expect(unavailable).toHaveLength(1)
  })

  it("rejects a product that has been deactivated", () => {
    const { lines, unavailable } = buildPricedLines(
      [item()],
      [{ ...CAKE, active: false }]
    )
    expect(lines).toEqual([])
    expect(unavailable).toHaveLength(1)
  })

  it("rejects a size key that no longer exists", () => {
    const { lines, unavailable } = buildPricedLines(
      [item({ sizeKey: "deleted-key" })],
      [CAKE]
    )
    expect(lines).toEqual([])
    expect(unavailable[0]).toContain("Victoria Sponge")
  })

  it("rejects a size with no price rather than charging zero", () => {
    const { lines, unavailable } = buildPricedLines(
      [item({ sizeKey: "kfree" })],
      [{ ...CAKE, sizes: [{ _key: "kfree", label: "Free?", price: null }] }]
    )
    expect(lines).toEqual([])
    expect(unavailable).toHaveLength(1)
  })

  it("keeps good lines and reports only the bad ones", () => {
    const { lines, unavailable } = buildPricedLines(
      [item(), item({ productId: "gone" })],
      [CAKE]
    )
    expect(lines).toHaveLength(1)
    expect(unavailable).toHaveLength(1)
  })

  it("carries variations and notes through to the snapshot", () => {
    const { lines } = buildPricedLines(
      [
        item({
          variations: { size: "6 inch", flavour: "Lemon", colour: "Cobalt" },
          notes: "Happy 30th Sarah",
        }),
      ],
      [CAKE]
    )
    expect(lines[0].variations).toEqual({
      size: "6 inch",
      flavour: "Lemon",
      colour: "Cobalt",
    })
    expect(lines[0].notes).toBe("Happy 30th Sarah")
  })

  it("converts prices to whole cents", () => {
    // 85.45 * 100 is 8544.999... in binary floating point; rounding is what
    // keeps a numeric(10,2) column honest.
    const { lines } = buildPricedLines(
      [item({ sizeKey: "kodd" })],
      [{ ...CAKE, sizes: [{ _key: "kodd", label: "Odd", price: 85.45 }] }]
    )
    expect(lines[0].unitAmountCents).toBe(8545)
  })
})

describe("totalCents", () => {
  it("sums lines in cents", () => {
    const { lines } = buildPricedLines(
      [item(), item({ sizeKey: "k8" })],
      [CAKE]
    )
    expect(totalCents(lines)).toBe(20500)
  })

  it("totals an empty cart as zero", () => {
    expect(totalCents([])).toBe(0)
  })

  it("does not accumulate floating-point error across many lines", () => {
    const { lines } = buildPricedLines(
      Array.from({ length: 10 }, () => item({ sizeKey: "kodd" })),
      [{ ...CAKE, sizes: [{ _key: "kodd", label: "Odd", price: 0.1 }] }]
    )
    expect(totalCents(lines)).toBe(100)
  })
})
