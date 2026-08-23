import { getStripeServer } from "@/lib/stripe/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type RefundResult =
  | { ok: true; alreadyRefunded: boolean; refundId: string | null }
  | { ok: false; error: string }

/**
 * Fully refund a paid order.
 *
 * Called on cancel (see `updateOrderStatus`). Deliberately its own function so a
 * future manual "refund" affordance can reuse it. Full refund only — no partial
 * or late-cancellation logic yet.
 *
 * Idempotent two ways: a `refunded_at` short-circuit skips the Stripe call once
 * a refund is recorded, and a per-order idempotency key means even a racing
 * second call can't create a second refund at Stripe. The `payment_intent` id
 * isn't stored, so it's read back off the checkout session at refund time.
 */
export async function refundOrder(orderId: string): Promise<RefundResult> {
  const db = createAdminClient()

  const { data: order, error } = await db
    .from("order")
    .select("id, stripe_session_id, refunded_at, stripe_refund_id")
    .eq("id", orderId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: `Failed to load order: ${error.message}` }
  }
  if (!order) {
    return { ok: false, error: "Order not found." }
  }
  if (order.refunded_at) {
    return { ok: true, alreadyRefunded: true, refundId: order.stripe_refund_id }
  }
  if (!order.stripe_session_id) {
    return {
      ok: false,
      error: "No Stripe session on this order — can't refund automatically.",
    }
  }

  const stripe = getStripeServer()

  let paymentIntentId: string | null
  try {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_session_id
    )
    paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null)
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't read the payment from Stripe: ${message(err)}`,
    }
  }

  if (!paymentIntentId) {
    return {
      ok: false,
      error: "No payment found on this order — nothing to refund.",
    }
  }

  let refundId: string
  try {
    // No `amount` = full refund. The idempotency key is per order, so a retry
    // returns the same refund instead of creating a second one.
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `refund-${orderId}` }
    )
    refundId = refund.id
  } catch (err) {
    return { ok: false, error: `Stripe refused the refund: ${message(err)}` }
  }

  const { error: updateError } = await db
    .from("order")
    .update({
      refunded_at: new Date().toISOString(),
      stripe_refund_id: refundId,
    })
    .eq("id", orderId)

  if (updateError) {
    // The money is already refunded; only our record failed. Report it so the
    // caller doesn't treat the refund as failed and block the cancel — the
    // idempotency key keeps a retry safe.
    console.error(
      `[orders] refunded ${orderId} but failed to record it`,
      updateError
    )
  }

  return { ok: true, alreadyRefunded: false, refundId }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error"
}
