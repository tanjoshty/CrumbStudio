import { addMinutes } from "date-fns"

import { checkCapacity } from "@/lib/capacity/service"
import { getStripeServer } from "@/lib/stripe/server"
import { client as sanityClient } from "@/lib/sanity/client"
import { PRODUCT_PRICING_QUERY } from "@/lib/sanity/queries"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendOrderConfirmation } from "./confirmation"
import { capacityMessage, holdErrorToMessage } from "./errors"
import { buildPricedLines, totalCents } from "./pricing"
import type {
  OrderErrorCode,
  PlaceOrderInput,
  PlaceOrderResult,
  PricedLine,
  PricingProduct,
} from "./types"

export type {
  OrderError,
  OrderErrorCode,
  PlaceOrderInput,
  PlaceOrderItem,
  PlaceOrderResult,
} from "./types"

/**
 * Order placement.
 *
 * Deliberately a service rather than route-handler code: a future non-web
 * source (an Instagram DM order, the admin creating one by hand) must reuse
 * this exact path, because this is where pricing, capacity and the hold are
 * decided. The route handles HTTP; this handles the order.
 *
 * The browser supplies intent only — product ids, sizes, dates, notes. Prices
 * come from Sanity, capacity from Postgres, and the total from neither the cart
 * nor the client.
 */

/**
 * How long a checkout holds its slot.
 *
 * Not Stripe's ~24h session default: with Mon–Thu sharing a single weekly slot,
 * a day-long hold lets one abandoned checkout block half a week. The Stripe
 * session gets a matching `expires_at`, so the payment form cannot outlive the
 * slot it is paying for.
 */
export const HOLD_MINUTES = 45

/** Prices in Sanity are plain numbers; this is the currency they are in. */
const CURRENCY = "aud"

function fail(
  code: OrderErrorCode,
  message: string,
  offending?: string[]
): PlaceOrderResult {
  return { ok: false, error: { code, message, offending } }
}

export async function placeOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  if (input.items.length === 0) {
    return fail("EMPTY_CART", "Your cart is empty.")
  }

  if (!input.email.includes("@")) {
    return fail("INVALID_REQUEST", "A valid email address is required.")
  }

  // The DB enforces this with a CHECK; catching it here turns a 500 into a
  // message the customer can act on.
  const deliveryAddress =
    input.fulfillmentType === "delivery" ? input.deliveryAddress?.trim() : null
  if (input.fulfillmentType === "delivery" && !deliveryAddress) {
    return fail("ADDRESS_REQUIRED", "A delivery address is required.")
  }

  // CDN disabled: it can serve a price the baker has already changed, and
  // "cheap because it was cached" is not a discount anyone chose to offer.
  const products = await sanityClient
    .withConfig({ useCdn: false })
    .fetch<PricingProduct[]>(PRODUCT_PRICING_QUERY, {
      ids: [...new Set(input.items.map((item) => item.productId))],
    })

  const { lines, unavailable } = buildPricedLines(input.items, products)

  if (unavailable.length > 0) {
    return fail(
      "PRODUCT_UNAVAILABLE",
      unavailable.length === 1
        ? `${unavailable[0]} is no longer available. Please remove it from your cart.`
        : "Some items are no longer available. Please remove them from your cart.",
      unavailable
    )
  }

  const capacity = await checkCapacity(
    lines.map((line) => ({ fulfillmentDate: line.fulfillmentDate, quantity: 1 }))
  )

  if (!capacity.ok) {
    return fail(
      "DATE_UNAVAILABLE",
      capacityMessage(capacity.failures),
      capacity.failures.map((f) => f.date)
    )
  }

  const total = totalCents(lines)
  const db = createAdminClient()
  const customerId = await upsertCustomer(db, input)
  const holdExpiresAt = addMinutes(new Date(), HOLD_MINUTES)

  // The hold comes before the Stripe session: capacity is the scarce resource,
  // and a session for a slot we could not reserve is worse than no session.
  const { data: orderId, error: holdError } = await db.rpc("place_order_hold", {
    p_customer_id: customerId,
    p_fulfillment_type: input.fulfillmentType,
    p_delivery_address: deliveryAddress,
    p_total: total / 100,
    p_hold_expires_at: holdExpiresAt.toISOString(),
    p_items: lines.map((line) => ({
      sanity_product_id: line.productId,
      variations: line.variations,
      quantity: 1,
      unit_price: line.unitAmountCents / 100,
      fulfillment_date: line.fulfillmentDate,
      notes: line.notes ?? null,
    })),
  })

  if (holdError || !orderId) {
    // The function re-checks capacity under an advisory lock, so this is the
    // branch a genuinely concurrent checkout lands in: the pre-check above
    // passed and the slot went between then and the write.
    const mapped = holdErrorToMessage(holdError?.message ?? "")
    return fail(mapped.code, mapped.message)
  }

  let clientSecret: string | null = null
  try {
    clientSecret = await createCheckoutSession({
      orderId: orderId as string,
      lines,
      email: input.email,
      origin: input.origin,
      expiresAt: holdExpiresAt,
    })
  } catch (error) {
    console.error("[orders] Stripe session failed", error)
  }

  if (!clientSecret) {
    // Release the slot rather than leaving it held by an order that can never
    // be paid for.
    await db
      .from("order")
      .update({ status: "cancelled" })
      .eq("id", orderId as string)
    return fail(
      "PAYMENT_SETUP_FAILED",
      "We could not start the payment. Please try again."
    )
  }

  return {
    ok: true,
    orderId: orderId as string,
    clientSecret,
    total: total / 100,
  }
}

async function upsertCustomer(
  db: ReturnType<typeof createAdminClient>,
  input: PlaceOrderInput
): Promise<string> {
  if (input.userId) {
    const { data: existing } = await db
      .from("customer")
      .select("id")
      .eq("user_id", input.userId)
      .maybeSingle()

    if (existing) {
      // Refresh contact details but leave `address` alone — that is the saved
      // default, not this order's delivery address.
      await db
        .from("customer")
        .update({ email: input.email, phone_number: input.phone ?? null })
        .eq("id", existing.id)
      return existing.id as string
    }

    const { data, error } = await db
      .from("customer")
      .insert({
        user_id: input.userId,
        email: input.email,
        phone_number: input.phone ?? null,
      })
      .select("id")
      .single()

    if (error) throw new Error(`Failed to create customer: ${error.message}`)
    return data.id as string
  }

  // Guests get a fresh row every time. Deduping by email would silently merge
  // two people who share one, or link a guest's history to an account they have
  // not proven they own — a decision, not a default.
  const { data, error } = await db
    .from("customer")
    .insert({ email: input.email, phone_number: input.phone ?? null })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to create guest customer: ${error.message}`)
  return data.id as string
}

async function createCheckoutSession(args: {
  orderId: string
  lines: PricedLine[]
  email: string
  origin: string
  expiresAt: Date
}): Promise<string | null> {
  const stripe = getStripeServer()

  const session = await stripe.checkout.sessions.create({
    // `embedded_page`, not `embedded` — the Stripe SDK v22 renamed the ui_mode
    // values (`embedded` -> `embedded_page`, `hosted` -> `hosted_page`). Most
    // guides still show the old names.
    ui_mode: "embedded_page",
    mode: "payment",
    customer_email: args.email,
    // Inline price_data — no Stripe Products to keep in sync with Sanity.
    line_items: args.lines.map((line) => ({
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: line.unitAmountCents,
        product_data: {
          name: [line.productName, line.sizeLabel].filter(Boolean).join(" — "),
          description:
            [line.variations.flavour, line.variations.colour, line.fulfillmentDate]
              .filter(Boolean)
              .join(" · ") || undefined,
        },
      },
    })),
    // Expire with the hold, so the form cannot outlive the slot it is paying
    // for. Stripe requires at least 30 minutes.
    expires_at: Math.floor(args.expiresAt.getTime() / 1000),
    return_url: `${args.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    // Phase 4's webhook finds the order by stripe_session_id; this is a
    // human-readable cross-reference in the Stripe dashboard.
    metadata: { order_id: args.orderId },
    payment_intent_data: { metadata: { order_id: args.orderId } },
  })

  const db = createAdminClient()
  const { error } = await db
    .from("order")
    .update({ stripe_session_id: session.id })
    .eq("id", args.orderId)

  if (error) {
    // Without this link the webhook cannot confirm the order, so treat it as a
    // failed setup rather than letting the customer pay into a void.
    console.error("[orders] failed to link stripe session", error)
    await stripe.checkout.sessions.expire(session.id)
    return null
  }

  return session.client_secret
}

/**
 * What confirming a paid checkout did. The webhook logs on the two abnormal
 * outcomes; everything else is a quiet success or a harmless replay.
 */
export type ConfirmOutcome =
  /** `pending → confirmed`, this call. */
  | "confirmed"
  /** Already `confirmed` or further along — a Stripe retry. No change. */
  | "noop"
  /** No order carries this session id. Phase 2 made a session without a hold. */
  | "not_found"
  /** Order was `cancelled` before payment landed — paid, but the slot is gone. */
  | "cancelled_conflict"

/**
 * Turn a paid reservation into a confirmed order.
 *
 * The only writer of `confirmed`. The row and its items already exist from
 * checkout (Phase 2), snapshotted with the right prices and dates — so this is
 * a status flip, never an insert, and it must not rewrite anything from the
 * Stripe payload.
 *
 * Idempotent and order-independent: Stripe retries and can deliver out of
 * order, so the decision branches on the row's *current* status, and the write
 * is guarded `status = 'pending'` so a late event can never move a confirmed or
 * cancelled order.
 */
export async function confirmOrder(sessionId: string): Promise<ConfirmOutcome> {
  const db = createAdminClient()

  const { data: order, error } = await db
    .from("order")
    .select("id, status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up order for ${sessionId}: ${error.message}`)
  }
  if (!order) return "not_found"
  if (order.status === "cancelled") return "cancelled_conflict"
  if (order.status !== "pending") return "noop" // already confirmed or beyond

  // Guarded on `pending`: if a concurrent event flipped the row between the read
  // and here, `select()` comes back empty and we treat it as an already-handled
  // no-op rather than a second confirmation.
  const { data: updated, error: updateError } = await db
    .from("order")
    .update({ status: "confirmed" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id")

  if (updateError) {
    throw new Error(`Failed to confirm order ${order.id}: ${updateError.message}`)
  }
  const confirmed = updated !== null && updated.length > 0
  if (confirmed) {
    // After the commit, never before — a receipt for an order that never pays
    // is worse than a late one. A send failure must not fail the webhook:
    // Stripe would retry, and a retry that re-sends email is worse than a
    // missed one. So swallow it here; the null `confirmation_sent_at` leaves an
    // admin resend as the recovery path.
    try {
      await sendOrderConfirmation(order.id)
    } catch (err) {
      console.error("[orders] confirmation email failed", order.id, err)
    }
  }
  return confirmed ? "confirmed" : "noop"
}

/** What releasing a reservation did. */
export type ReleaseOutcome =
  /** `pending → cancelled`, this call. The slot is freed. */
  | "released"
  /** Already `cancelled` — a duplicate expiry/failure event. */
  | "noop"
  /** No order carries this session id. */
  | "not_found"
  /** Order was already `confirmed` (or beyond); a late expiry must not cancel it. */
  | "refused_confirmed"

/**
 * Release a slot when payment never completes — `checkout.session.expired` or
 * `async_payment_failed`.
 *
 * The write is guarded `status = 'pending'`, which is the guarantee that a late
 * `expired` event (they fire ~24h out and can race a `completed`) can never
 * cancel an order that was already confirmed.
 */
export async function releaseReservation(
  sessionId: string
): Promise<ReleaseOutcome> {
  const db = createAdminClient()

  const { data: order, error } = await db
    .from("order")
    .select("id, status")
    .eq("stripe_session_id", sessionId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up order for ${sessionId}: ${error.message}`)
  }
  if (!order) return "not_found"
  if (order.status === "cancelled") return "noop"
  if (order.status !== "pending") return "refused_confirmed"

  const { data: updated, error: updateError } = await db
    .from("order")
    .update({ status: "cancelled" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id")

  if (updateError) {
    throw new Error(`Failed to release order ${order.id}: ${updateError.message}`)
  }
  return updated && updated.length > 0 ? "released" : "refused_confirmed"
}
