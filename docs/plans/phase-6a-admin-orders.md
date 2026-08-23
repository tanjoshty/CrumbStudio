# Phase 6a — Admin order management

**Status:** In review (2026-08-23) — code complete; awaiting an authed browser pass
**Depends on:** Phase 4 (needs real orders to manage)
**Blocks:** Phase 6b (shares the admin shell + auth gate)

## Goal

One place for the baker to see what has been ordered and work through it by date.
This is the app's daily-use surface — the storefront is used once per customer,
this is used every day. Capacity editing is split out into
[Phase 6b](./phase-6b-admin-capacity.md); this phase is orders.

## Current state

`app/admin/page.tsx` exists as an auth-gated placeholder. `proxy.ts` already
protects `/admin/*` via `updateSession`, with a page-level `getClaims()` check as
a fallback. There is no admin UI yet.

## Scope

**In:** the admin auth gate (allow-list), the admin shell/nav, order list and
detail, a bake-queue view by fulfilment date, status transitions, and a cancel
path that releases capacity.

**Out:** capacity editing (Phase 6b). Catalogue editing — that is Sanity Studio's
job (`pnpm dev:studio`), and duplicating it here would create a second source of
truth for products.

## Design notes

### Who is an admin — env allow-list

`proxy.ts` currently treats *any* authenticated user as an admin for `/admin/*`,
and customers can sign up through `app/auth/sign-up` — so today every customer
who registers can reach the admin area. Harmless while `/admin` is a
placeholder; **a live authorisation gap the moment it renders real order data**,
so close it before the first real view lands.

Per [C7](./README.md#c7--admin-authorisation-env-allow-list-decided-2026-08-20):
an `ADMIN_USER_IDS` allow-list in env, checked in `proxy.ts` against the JWT
`sub` from the existing `getClaims()` call. No schema, no per-request DB round
trip, and adding an admin costs a redeploy — acceptable for one baker. Keep the
page-level check in `app/admin/page.tsx` as a fallback.

### Views

- **Queue** (the default): items grouped by `fulfillment_date`, ascending —
  matches how baking is actually scheduled. Note this is an `order_item` view,
  not an `order` view, because dates are per line. An open question from the
  2026-07-11 diary is still open: whether `order_item` gets its own fulfilment
  lifecycle and `order.status` becomes a rollup. A one-cake-per-order business
  can defer it; a multi-item order spanning several dates makes a single
  order-level status awkward the first time half of it is ready. **Deferred for
  6a: status stays at the order level.**
- **Orders**: one row per order, filterable by status, with a detail page
  showing items, customer, fulfilment type and address.

### Pending orders are not orders

Phase 2 writes `pending` rows as capacity holds
([C2](./README.md#c2--reservation-model-pending-order-rows-decided-2026-08-20)),
so **every view here must filter `status != 'pending'`** or abandoned checkouts
show up as real orders in the queue. The one exception is a deliberate
diagnostic view, if you ever want to see abandonment.

### Data access

Server Components with the service-role client (C3), never the browser client —
RLS denies everything to the publishable key anyway. Status transitions go
through a server action that validates the transition rather than accepting any
`order_status` the form posts.

### Status transitions

`pending → confirmed` is the webhook's (Phase 4). The admin owns
`confirmed → in_progress → ready → completed`, plus `cancelled`. Cancelling must
release capacity — because the `capacity_booking` view already excludes
`cancelled` orders, setting the status to `cancelled` frees the slot on its own;
the state machine just has to allow it and nothing else.

## Tasks

- [x] Add the `ADMIN_USER_IDS` check in `proxy.ts` (`lib/auth/admin.ts`); stop
      treating any authenticated user as an admin. Var added to `.env.local`;
      Phase 7 adds it to the deployed stage. Page-level fallback in the admin
      layout.
- [x] Admin shell/nav (Queue / Orders) — `app/admin/layout.tsx` + `AdminNav`.
- [x] Queue view grouped by `order_item.fulfillment_date` (`app/admin/page.tsx`).
- [x] Order list with status filter + order detail page (`app/admin/orders/*`).
- [x] Status-transition server action with a validated state machine
      (`lib/orders/status.ts`, `updateOrderStatus`, `app/admin/actions.ts`).
- [x] Cancel path that releases capacity (status → `cancelled`; the
      `capacity_booking` view frees the slot on its own).
- [x] Empty and loading states (`app/admin/loading.tsx` + per-view empty copy).

### Verified
- Unauthenticated `/admin`, `/admin/orders`, `/admin/orders/[id]` all 307 →
  `/auth/login`.
- `pnpm build` / `pnpm lint` clean; 83 unit tests (13 new: allow-list + state
  machine).
- Authed admin views / transitions: pending a browser pass after a dev restart
  (needs `ADMIN_USER_IDS` + the proxy change loaded).

## Files

- `app/admin/*` (build out)
- `components/admin/*` (new)
- `proxy.ts` (role check)
- `lib/orders/service.ts` (extend: validated transition + cancel)

## Follow-up (separate PR): refund on cancel

**Decided 2026-08-23.** 6a's cancel frees capacity but does **not** touch Stripe —
a paid order stays charged, and the cancel dialog says so explicitly. A focused
follow-up PR adds the refund, kept out of 6a so the money path gets isolated
review:

- **Always a full refund** on cancelling a paid order (`confirmed` / `in_progress`
  / `ready`). No partial/late-cancellation logic yet.
- The `payment_intent` id isn't persisted — retrieve it from the order's
  `stripe_session_id` at cancel time (`session.payment_intent`), then create the
  refund.
- **Idempotent**: a refund idempotency key (e.g. `refund-<orderId>`) so a
  double-click or retry never double-refunds. Record `refunded_at` /
  `stripe_refund_id` on `"order"` (new columns → manual `ALTER`).
- **Refund before cancel**: if the refund fails, do not flip to `cancelled` —
  surface the error so there's never a silent "cancelled but not refunded".

## Done when

- A confirmed order appears in the queue on its fulfilment date.
- Statuses can be moved forward and the change persists.
- Cancelling frees the slot for rebooking.
- A non-admin signed-in user cannot reach `/admin`.
