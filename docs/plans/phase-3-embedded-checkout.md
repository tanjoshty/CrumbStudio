# Phase 3 — Stripe embedded checkout UI

**Status:** Not started
**Depends on:** Phase 2 (needs a real client secret)

## Goal

Replace the placeholder card fields in `CheckoutForm` with Stripe's embedded
checkout, and give the customer a real return/confirmation page.

## Current state

`components/checkout/CheckoutForm.tsx` renders hand-rolled "Card number /
Expiry / CVC" inputs under a comment saying `Demo only — no payment is
processed`. It calls `/api/checkout` from a `useEffect` keyed on
`[cartItems, total]`, which fires on every cart mutation — the session must
instead be created once, deliberately, from the collected contact and
fulfilment details.

`@stripe/react-stripe-js` and `@stripe/stripe-js` are already installed.

## Scope

**In:** contact/fulfilment collection, session creation on submit, the embedded
Stripe form, the return page, and cart clearing.

**Out:** order confirmation itself — the webhook owns that (Phase 4). The return
page reads state; it never writes an order.

## Design notes

### Publishable key — already fixed

`NEXT_STRIPE_PUBLISHABLE_KEY` had no `NEXT_PUBLIC_` prefix, so it never reached
the browser and `loadStripe` would have received `undefined`. Renamed to
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on 2026-08-20 (see
[C5](./README.md#c5--environment-variables)). The secret key stays server-only —
never import it into a Client Component.

### Two steps, not one

The form currently mixes contact, fulfilment, and payment in one submit. With
embedded checkout the flow is: collect contact + fulfilment → POST
`/api/checkout` → mount `<EmbeddedCheckout>` with the returned client secret.
Drop the `useEffect` fetch entirely; it creates sessions nobody asked for.

Delivery address is required when `fulfillment === 'delivery'` — the DB enforces
it with a CHECK, so validate client-side too rather than surfacing a 500.

### The return page

`return_url` points at a new `app/checkout/return/page.tsx` carrying
`{CHECKOUT_SESSION_ID}`. It retrieves the session server-side and renders
success / still-processing / failed. Because the webhook may not have landed
yet, "paid but no order row" must render as *processing*, not as an error, and
poll or refresh. Clear the Zustand cart only on a confirmed-paid session.

### Trust boundary

The return page displays status; it must not create or confirm the order even if
the session says `paid`. That path is Phase 4's, and duplicating it here creates
two writers for one order.

## Tasks

- [x] ~~Rename the publishable key env var.~~ Done 2026-08-20.
- [ ] Read it in a module-level `loadStripe` singleton — never inside render.
- [ ] Split `CheckoutForm` into details-collection and payment stages; remove
      the `useEffect` session fetch.
- [ ] Validate required fields client-side (email; delivery address when
      delivering) before POSTing.
- [ ] Mount `<EmbeddedCheckoutProvider>` / `<EmbeddedCheckout>` with the client
      secret; keep the existing order-summary aside and brand styling.
- [ ] Add `app/checkout/return/page.tsx` — retrieve session, render
      success/processing/failed, clear the cart on success.
- [ ] Surface Phase 2's typed errors inline (sold-out date, inactive product) so
      the customer can fix the cart.

## Files

- `components/checkout/CheckoutForm.tsx` (rewrite)
- `app/checkout/return/page.tsx` (new)
- ~~`apps/frontend/.env.local` (rename key)~~ — done 2026-08-20

## Done when

- A test-card payment completes end to end in the sandbox and lands on the
  return page.
- Declined and abandoned payments render sensibly rather than blanking.
- The cart clears only after a confirmed-paid session.
- No session is created merely by opening the checkout page.
