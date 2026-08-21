import { loadStripe, type Stripe } from "@stripe/stripe-js"

/**
 * Browser-side Stripe singleton.
 *
 * `loadStripe` injects a script and must run once per page load, never per
 * render — so the promise is memoised at module scope and every
 * `EmbeddedCheckoutProvider` shares it. The publishable key is safe in the
 * browser; it only reaches here because it carries the `NEXT_PUBLIC_` prefix.
 */
let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
    )
  }
  return stripePromise
}
