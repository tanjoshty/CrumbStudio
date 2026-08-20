# Phase 6 — Admin order management

**Status:** Not started
**Depends on:** Phase 4 (needs real orders to manage)

## Goal

One place for the baker to see what has been ordered, work through it by date,
and adjust capacity. This is the app's daily-use surface — the storefront is
used once per customer, this is used every day.

## Current state

`app/admin/page.tsx` exists as an auth-gated placeholder. `proxy.ts` already
protects `/admin/*` via `updateSession`, with a page-level `getClaims()` check
as a fallback. There is no admin UI yet.

## Scope

**In:** order list and detail, status transitions, a bake-queue view by
fulfilment date, and capacity editing.

**Out:** catalogue editing — that is Sanity Studio's job (`pnpm dev:studio`),
and duplicating it here would create a second source of truth for products.

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
  order-level status awkward the first time half of it is ready.
- **Orders**: one row per order, filterable by status, with a detail page
  showing items, customer, fulfilment type and address.
- **Capacity**: edit `capacity_pool` counts, add `capacity_override` rows for a
  busy or quiet week, and toggle `date_closure` dates. This is the intended home
  for the [C0](./README.md#c0--capacity-of-record-set-2026-08-20) numbers — until
  it exists they live in `db/seed.sql` and change by re-running it, which works
  but does not survive contact with a real week.

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
release capacity — the same release path as an expired session, or a cancelled
order silently keeps consuming its slot.

## Tasks

- [ ] Add the `ADMIN_USER_IDS` check in `proxy.ts`; stop treating any
      authenticated user as an admin. Add the var to `.env.local` and (Phase 7)
      to the deployed stage.
- [ ] Queue view grouped by `order_item.fulfillment_date`.
- [ ] Order list with status filter + order detail page.
- [ ] Status-transition server action with a validated state machine.
- [ ] Cancel path that releases capacity.
- [ ] Capacity editor: pools, per-week overrides, date closures.
- [ ] Empty and loading states — the queue is usually short, not empty-by-bug.

## Files

- `app/admin/*` (build out)
- `components/admin/*` (new)
- `proxy.ts` (role check)
- `lib/orders/service.ts`, `lib/capacity/service.ts` (extend)

## Done when

- A confirmed order appears in the queue on its fulfilment date.
- Statuses can be moved forward and the change persists.
- Cancelling frees the slot for rebooking.
- Capacity and closures are editable without touching SQL.
- A non-admin signed-in user cannot reach `/admin`.
