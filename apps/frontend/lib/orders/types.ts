/** Shared shapes for order placement. No IO, no dependencies. */

export interface PlaceOrderItem {
  productId: string
  /** Stable `_key` of the Sanity `sizes[]` member — never the label. */
  sizeKey: string
  /** `yyyy-MM-dd`. */
  fulfillmentDate: string
  variations: { size?: string; flavour?: string; colour?: string }
  notes?: string
}

export interface PlaceOrderInput {
  items: PlaceOrderItem[]
  email: string
  phone?: string
  fulfillmentType: "pickup" | "delivery"
  deliveryAddress?: string
  /** Set when the customer is signed in; guests are first-class here. */
  userId?: string | null
  /** Origin for Stripe's `return_url`, e.g. `https://crumb.studio`. */
  origin: string
}

export type OrderErrorCode =
  | "EMPTY_CART"
  | "INVALID_REQUEST"
  | "ADDRESS_REQUIRED"
  | "PRODUCT_UNAVAILABLE"
  | "DATE_UNAVAILABLE"
  | "PAYMENT_SETUP_FAILED"

export interface OrderError {
  code: OrderErrorCode
  /** Safe to show a customer verbatim. */
  message: string
  /** The dates or products they need to change, when that is the fix. */
  offending?: string[]
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; clientSecret: string; total: number }
  | { ok: false; error: OrderError }

/** A cart line once the server has priced it from Sanity. */
export interface PricedLine {
  productId: string
  productName: string
  sizeLabel: string
  /** Cents. Prices are never carried as floats past this point. */
  unitAmountCents: number
  fulfillmentDate: string
  variations: PlaceOrderItem["variations"]
  notes?: string
}

/** The shape `PRODUCT_PRICING_QUERY` returns. */
export interface PricingProduct {
  _id: string
  name: string | null
  active: boolean | null
  sizes: { _key: string; label: string | null; price: number | null }[] | null
}
