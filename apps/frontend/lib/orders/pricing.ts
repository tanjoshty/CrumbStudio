import type { PlaceOrderItem, PricedLine, PricingProduct } from "./types"

/**
 * Prices a cart against the catalogue.
 *
 * Pure: the caller fetches from Sanity, this decides what the lines cost. The
 * client's own `price` field never reaches here — it is display data, and a
 * tampered value must change what the customer sees, not what they are charged.
 */
export function buildPricedLines(
  items: PlaceOrderItem[],
  products: PricingProduct[]
): { lines: PricedLine[]; unavailable: string[] } {
  const byId = new Map(products.map((product) => [product._id, product]))
  const lines: PricedLine[] = []
  const unavailable: string[] = []

  for (const item of items) {
    const product = byId.get(item.productId)

    // Missing means deleted or unpublished since the cake went in the cart.
    if (!product || product.active === false) {
      unavailable.push(item.variations.size ?? item.productId)
      continue
    }

    // By `_key`, never by label: labels are editable in the Studio, so pricing
    // off one would break silently the first time a size is renamed.
    const size = product.sizes?.find((s) => s._key === item.sizeKey)
    if (!size || typeof size.price !== "number") {
      unavailable.push(
        `${product.name ?? "This cake"} (${item.variations.size ?? "selected size"})`
      )
      continue
    }

    const sizeLabel = size.label ?? item.variations.size ?? ""

    lines.push({
      productId: product._id,
      productName: product.name ?? "Cake",
      sizeLabel,
      // Cents throughout: numeric(10,2) columns and float arithmetic on money
      // do not mix well.
      unitAmountCents: Math.round(size.price * 100),
      fulfillmentDate: item.fulfillmentDate,
      // The size in the snapshot comes from the catalogue, not the client. The
      // price is chosen by `_key`, so a payload whose label disagrees with its
      // key would otherwise record one size on an order charged for another —
      // and the baker reads this field to decide what to bake.
      variations: { ...item.variations, size: sizeLabel },
      notes: item.notes,
    })
  }

  return { lines, unavailable }
}

/** Order total in cents. One cake per line, so quantity is always 1. */
export function totalCents(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitAmountCents, 0)
}
