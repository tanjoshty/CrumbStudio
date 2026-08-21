import Stripe from "stripe"

/**
 * Server-side Stripe client.
 *
 * One instance, reused across requests. Reads the secret key — which must never
 * be imported into a Client Component — from the server-only env. Throwing on a
 * missing key fails loudly at first use rather than sending Stripe an empty
 * string and getting an opaque auth error back.
 */
let stripe: Stripe | null = null

export function getStripeServer(): Stripe {
  if (!stripe) {
    const key = process.env.NEXT_STRIPE_SECRET_KEY
    if (!key) {
      throw new Error("NEXT_STRIPE_SECRET_KEY is not set")
    }
    stripe = new Stripe(key)
  }
  return stripe
}
