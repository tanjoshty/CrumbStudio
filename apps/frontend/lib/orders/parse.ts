import type { PlaceOrderItem } from "./types"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Guards against a pathological cart; the capacity check handles real limits. */
export const MAX_ITEMS = 20

/**
 * Validates the shape of a posted cart.
 *
 * Shape only — this decides whether the request is *readable*, not whether the
 * order is allowed. Prices, availability and totals are the service's call, so
 * anything money-shaped in the payload is dropped here rather than validated.
 *
 * Returns null on anything malformed: a cart the server cannot read is a bug or
 * an attack, and neither deserves a partial order.
 */
export function parseCheckoutItems(raw: unknown): PlaceOrderItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) {
    return null
  }

  const items: PlaceOrderItem[] = []

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null
    const item = entry as Record<string, unknown>

    if (typeof item.productId !== "string" || item.productId === "") return null
    if (typeof item.sizeKey !== "string" || item.sizeKey === "") return null
    if (
      typeof item.fulfillmentDate !== "string" ||
      !DATE_PATTERN.test(item.fulfillmentDate)
    ) {
      return null
    }

    const variations =
      typeof item.variations === "object" && item.variations !== null
        ? (item.variations as Record<string, unknown>)
        : {}

    items.push({
      productId: item.productId,
      sizeKey: item.sizeKey,
      fulfillmentDate: item.fulfillmentDate,
      variations: {
        size: asString(variations.size),
        flavour: asString(variations.flavour),
        colour: asString(variations.colour),
      },
      notes: asString(item.notes),
    })
  }

  return items
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}
