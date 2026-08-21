import Link from "next/link"
import type Stripe from "stripe"

import { ClearCartOnSuccess } from "@/components/checkout/ClearCartOnSuccess"
import { getStripeServer } from "@/lib/stripe/server"

type Outcome = "success" | "processing" | "failed"

/**
 * Stripe's `return_url` lands here after the embedded form. This page *reads*
 * the session to tell the customer where they stand — it never creates or
 * confirms the order. That is the webhook's job (Phase 4); a second writer here
 * would race it. "Paid" is decided from Stripe's own status, not from any order
 * row, so the confirmation shows even before the webhook has landed.
 */
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams

  if (!session_id) {
    return (
      <Result
        outcome="failed"
        heading="Something went wrong"
        body="We couldn't find your checkout session. If you were charged, you'll still receive a confirmation email — otherwise please try again."
      />
    )
  }

  let session: Stripe.Checkout.Session | null = null
  try {
    session = await getStripeServer().checkout.sessions.retrieve(session_id)
  } catch {
    session = null
  }

  if (!session) {
    return (
      <Result
        outcome="failed"
        heading="We couldn't load your order"
        body="Please refresh this page. If you were charged, a confirmation email is on its way."
      />
    )
  }

  const outcome = outcomeOf(session)

  if (outcome === "success") {
    return (
      <>
        <ClearCartOnSuccess />
        <Result
          outcome="success"
          heading="Order confirmed"
          body="Thank you — your payment went through. A confirmation email with your order details is on its way. We can't wait to bake for you."
        />
      </>
    )
  }

  if (outcome === "processing") {
    return (
      <Result
        outcome="processing"
        heading="Payment processing"
        body="Your payment is still being processed. We'll email you as soon as it clears — no need to pay again. You can safely close this page."
      />
    )
  }

  return (
    <Result
      outcome="failed"
      heading="Payment not completed"
      body="Your payment didn't go through, so no order was placed and your cart is still saved. Please head back to checkout to try again."
    />
  )
}

/**
 * `payment_status` is the source of truth for money; `status` catches the
 * expired/open cases where no charge was attempted. `no_payment_required`
 * covers a fully discounted order.
 *
 * A completed session can still be `unpaid` when an async method (bank debit,
 * some wallets) hasn't cleared yet — Stripe settles it later via
 * `async_payment_succeeded`. That is "processing", not a failure.
 */
function outcomeOf(session: Stripe.Checkout.Session): Outcome {
  if (session.status !== "complete") {
    return "failed"
  }
  if (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  ) {
    return "success"
  }
  return "processing"
}

function Result({
  outcome,
  heading,
  body,
}: {
  outcome: Outcome
  heading: string
  body: string
}) {
  const accent =
    outcome === "success"
      ? "text-cobalt"
      : outcome === "processing"
        ? "text-ink"
        : "text-burgundy"

  return (
    <div className="bg-cream text-ink min-h-screen">
      <div className="mx-auto max-w-xl px-6 py-24 flex flex-col items-center text-center gap-6">
        <p
          className={`font-display font-black text-[13px] tracking-[0.2em] uppercase ${accent}`}
        >
          {outcome === "success"
            ? "Paid"
            : outcome === "processing"
              ? "Pending"
              : "Not paid"}
        </p>
        <h1 className="font-display font-black text-[44px] leading-none uppercase text-ink">
          {heading}
        </h1>
        <p className="text-[15px] text-ink/75 max-w-md leading-relaxed">{body}</p>

        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {outcome === "failed" ? (
            <Link
              href="/checkout"
              className="bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase px-7 py-[16px] hover:bg-cobalt-dark transition-colors"
            >
              Back to checkout
            </Link>
          ) : (
            <Link
              href="/products"
              className="bg-cobalt text-cream text-[13px] font-medium tracking-[0.12em] uppercase px-7 py-[16px] hover:bg-cobalt-dark transition-colors"
            >
              Keep browsing
            </Link>
          )}
          <Link
            href="/"
            className="border border-cream-border bg-paper text-ink text-[13px] font-medium tracking-[0.12em] uppercase px-7 py-[16px] hover:border-ink transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
