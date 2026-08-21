import { NextRequest, NextResponse } from "next/server"
import type Stripe from "stripe"

import { confirmOrder, releaseReservation } from "@/lib/orders/service"
import { getStripeServer } from "@/lib/stripe/server"

// Stripe's SDK verifies signatures with Node's crypto — never the Edge runtime.
export const runtime = "nodejs"

/**
 * `POST /api/webhooks/stripe`
 *
 * Stripe is the trigger that turns a reservation into a confirmed order, and the
 * trigger that releases the slot when payment never happens. This is the only
 * writer of confirmed orders.
 *
 * The handler is deliberately thin: verify the signature, map the event to a
 * lifecycle function, and return 2xx unless something genuinely broke (a 500
 * just buys another retry). Idempotency and status guarding live in the service.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 })
  }

  // Raw body — parsing to JSON first would change the bytes and break the
  // signature. Next 16 route handlers hand back the untouched body from text().
  const payload = await request.text()

  let event: Stripe.Event
  try {
    event = getStripeServer().webhooks.constructEvent(payload, signature, secret)
  } catch (err) {
    // A forged or malformed request. 400, and no side effects.
    console.error("[webhook] signature verification failed", err)
    return NextResponse.json({ error: "invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const outcome = await confirmOrder(session.id)
        if (outcome === "not_found") {
          // A session with no hold means Phase 2 minted one without reserving —
          // a real bug, not a stray event.
          console.error(
            "[webhook] completed for a session with no order row",
            session.id
          )
        } else if (outcome === "cancelled_conflict") {
          // Paid, but the slot was already released. Needs a human.
          console.error(
            "[webhook] completed for an already-cancelled order — customer paid but the slot is gone",
            session.id
          )
        }
        break
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session
        const outcome = await releaseReservation(session.id)
        if (outcome === "not_found") {
          console.error(
            "[webhook] release for a session with no order row",
            session.id
          )
        }
        break
      }

      default:
        // Everything else is a 200 no-op — an unhandled event is not an error.
        break
    }
  } catch (err) {
    // Let Stripe retry: a transient DB failure should not be swallowed.
    console.error("[webhook] handler error", event.type, err)
    return NextResponse.json({ error: "handler error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
