# Implementation Plans

Phase-by-phase plans for the remaining CrumbStudio build. One file per phase.
These are the **source of truth for scope** — edit a phase doc when scope
changes, and the work follows the doc rather than the other way round.

`docs/diary/` records what *happened* and why. `docs/plans/` records what is
*going to happen*. When a phase ships, mark it Done here and write the diary
entry.

## Phases

| # | Phase | Status | Blocks |
|---|-------|--------|--------|
| [1](./phase-1-capacity-availability.md) | Capacity & availability | **Done** 2026-08-20 | 2 |
| [2](./phase-2-checkout-session.md) | Checkout API & slot reservation | **Done** 2026-08-20 | 3, 4 |
| [3](./phase-3-embedded-checkout.md) | Stripe embedded checkout UI | Next | 4 |
| [4](./phase-4-webhooks-orders.md) | Webhooks & order lifecycle | Not started | 5, 6 |
| [5](./phase-5-confirmation-email.md) | Confirmation email | Not started | — |
| [6](./phase-6-admin.md) | Admin order management | Not started | — |
| [7](./phase-7-deploy.md) | Deploy to AWS via SST | Not started | — |

Phases 1–4 are the critical path to a working order. 5–7 can follow in any order.

## Where things actually stand

Verified against the live Supabase project and the working tree on 2026-08-18:

- **Schema is applied.** All seven tables exist in `public` (`customer`,
  `order`, `order_item`, `capacity_pool`, `weekly_capacity`,
  `capacity_override`, `date_closure`). The README's "applying the schema to
  Supabase" to-do is stale.
- **`db/seed.sql` is applied** (2026-08-20, verified): `capacity_pool` holds the
  [C0](#c0--capacity-of-record-set-2026-08-20) counts and all seven weekdays are
  mapped in `weekly_capacity`. The order tables are still empty, as expected.
- **The Supabase MCP server is pinned `read_only=true`** (`.mcp.json`), and
  stays that way *(decided 2026-08-20)*. Every schema change is written as
  ready-to-run SQL and pasted into the Supabase SQL editor by hand, so it gets a
  human look before it lands — there is no staging project, and
  `db/schema.sql` + hand-written `ALTER TABLE`s are the only migration story.
  Phases 1, 2 and 5 each need one. Always update `db/schema.sql` in the same
  change, or the file and the live DB drift silently.
- **RLS is enabled on every table with zero policies**, i.e. deny-all for the
  anon/publishable key. Every server route that touches Postgres needs the
  service-role key (see Cross-cutting decisions).
- Phase 1 shipped: `lib/supabase/admin.ts`, `lib/capacity/constants.ts`,
  `lib/capacity/service.ts`, `app/api/availability/route.ts`, and a
  capacity-aware `ProductDatePicker`.
- `"order"` gained `stripe_session_id` and `hold_expires_at` early (Phase 2's
  columns) because the capacity predicate reads the latter. `db/schema.sql`
  matches the live DB.
- The Supabase **Data API had no exposed schemas**, so every PostgREST request
  returned `PGRST002 / 503` while direct SQL worked fine. Re-exposing `public`
  fixed it. Worth remembering: if `supabase-js` fails wholesale but the SQL
  editor is happy, check Exposed Schemas before debugging code.
- Phase 2 shipped: `POST /api/checkout` prices from Sanity, holds the slot via
  `place_order_hold`, and returns a Stripe client secret.
- `db/functions.sql` holds the capacity + reservation SQL. Both `service.ts`
  files read through it, so the calendar and the reservation share one
  definition of "full".
- Tests: `pnpm test` (vitest, 61 unit tests over the pure modules). Nothing in
  the suite touches Postgres, Sanity or Stripe.
- **Stripe's `ui_mode` is `embedded_page`**, not `embedded`, in SDK v22. Phase 3
  needs the same value.
- `CheckoutForm.tsx` posts to it from a `useEffect` and renders fake card
  fields. Both are placeholders to be replaced in phases 2–3.
- Stripe: two accounts on this machine — `Crumb Studio sandbox`
  (`acct_1TrejQA19fZk2KsN`, test) and `Crumb Haus` (`acct_1TrejHPE4jbIsCM5`,
  **live**). All development targets the sandbox.

## Cross-cutting decisions

Decisions that span phases. Settle them once here; phase docs reference them.

### C0 — Capacity of record *(set 2026-08-20)*

| Pool | Days | Cakes per week |
|------|------|----------------|
| `mon_thu` | Mon–Thu (shared) | 1 |
| `fri` | Fri | 2 |
| `sat` | Sat | 3 |
| `sun` | Sun | 2 |

Eight cakes a week, with Mon–Thu sharing a single slot between them. These live
in `db/seed.sql` and become editable by the baker in the admin panel (Phase 6);
until then they change in the seed file and get re-run.

### C1 — Capacity is weekly pools, not cakes per day

`CLAUDE.md` and `README.md` describe capacity as "cakes per day" with
`weekly_capacity.max_items`. The actual schema does not work that way:

- `capacity_pool` holds `max_items` **per week** for a named pool.
- `weekly_capacity` maps weekday (0 = Mon) → `pool_key`; weekdays sharing a pool
  share one weekly count (Mon–Thu share a single slot in the seed).
- `capacity_override` changes one pool's count for one week (`week_start` = that
  week's Monday).
- `date_closure` closes a specific date outright, independent of capacity.

A date is bookable iff it is not in `date_closure` **and** its pool has room
that week. The docs need correcting; the schema is right.

### C2 — Reservation model: pending order rows *(decided 2026-08-20)*

Both `CLAUDE.md` and `README.md` say checkout "reserves the slot", but nothing
in `db/schema.sql` modelled a hold. **Decision: the pending order is the hold.**

`POST /api/checkout` writes the `order` + `order_item` rows up front with
`status = 'pending'`, and capacity counts pending rows. The Stripe webhook flips
`pending → confirmed`; expiry or failure flips it to `cancelled` (or deletes
it), freeing the slot.

Chosen over a separate `capacity_hold` table because a hold would duplicate the
cart's exact shape into a second table, plus a sweeper and a union in every
capacity query — for a pending order row that already holds that data.

Consequences to carry through the phases:

- `"order"` needs `stripe_session_id text UNIQUE` (webhook idempotency) and
  `hold_expires_at timestamptz` (so a missed `expired` event cannot hold a slot
  forever). Neither column exists — add to `db/schema.sql` **and** `ALTER TABLE`.
- **Hold duration: 45 minutes** *(decided 2026-08-20)*, not Stripe's ~24h
  session default. With Mon–Thu sharing one weekly slot, a day-long hold would
  let a single abandoned checkout block half a week. Set the Stripe session's
  `expires_at` to match, so the webhook and the column agree.
- **Every admin and reporting query must filter out `pending`.** A pending row
  is an attempt, not an order; forgetting the filter shows abandoned carts as
  real orders.
- The README's "the Stripe webhook is what actually writes a confirmed order" is
  now wrong — the webhook *confirms* a row that checkout already wrote. Fix that
  line when Phase 4 lands.
- Which statuses consume capacity: `pending` (unexpired), `confirmed`,
  `in_progress`, `ready`, `completed`. `cancelled` never does, and neither does
  a `pending` row past its `hold_expires_at`.

### C3 — Server-side Supabase access

RLS is on with no policies, so the publishable key can read and write nothing.
Order writes, capacity reads, and admin queries all run server-side with
`SUPABASE_SERVICE_ROLE_KEY` through a dedicated admin client
(`lib/supabase/admin.ts`, does not exist yet) that is **never** imported from a
Client Component. The alternative — writing RLS policies for the anon role — is
not worth it here: no customer-facing surface needs direct table access.

### C4 — One cake per line; add `sizeKey` *(decided 2026-08-20)*

Two separate issues in `CartItem` (`types/cart.types.ts`), resolved differently:

**Quantity — not adding it.** `order_item.quantity` stays in the schema and is
always written as `1`. Adding the same cake twice creates two lines, each with
its own date and notes. Since date and notes are already per-line, quantity only
ever helps for two identical cakes, same date, same note — rare enough not to
buy cart-drawer +/- controls and line-merging logic. Capacity still counts
`SUM(quantity)`, so real quantity can be added later without touching the
capacity math.

**`sizeKey` — adding it.** `CartItem` stores `variations.size` as a display
label, but price lives on the Sanity `sizes[]` array member, whose stable
identifier is its `_key`. Recomputing price by matching a label string is
fragile: renaming a size in the Studio would silently break pricing or reject
valid carts. `CartItem` gets a `sizeKey` field, set at add-to-cart, and Phase 2
prices off `sizes[_key == $sizeKey].price`. The label stays for display.

### C5 — Environment variables

Present in `apps/frontend/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SANITY_PROJECT_ID`,
`NEXT_PUBLIC_SANITY_DATASET`, `NEXT_STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was renamed on 2026-08-20 — it previously
lacked the `NEXT_PUBLIC_` prefix, so it never reached the browser and
`loadStripe` would have received `undefined` in Phase 3. Nothing read it yet, so
the rename touched only `.env.local`.

Still needed:

- `SUPABASE_SERVICE_ROLE_KEY` — server-only, for C3.
- `STRIPE_WEBHOOK_SECRET` — Phase 4 signature verification.

Minor inconsistency, not worth churn now: the secret key is
`NEXT_STRIPE_SECRET_KEY` in the frontend but `STRIPE_SECRET_KEY` in the root
`.env.local` (which serves the Stripe MCP server). Unify when Phase 7 moves
secrets into SST.

### C6 — Sanity schema drift

`apps/studio/schemaTypes/product.ts` describes sizes as "the variant referenced
by `order_item.sanity_variant_id`", but the SQL column is `sanity_product_id`
plus a `variations` jsonb. The SQL is current; fix the Studio comment when
Phase 2 touches pricing.

### C7 — Admin authorisation: env allow-list *(decided 2026-08-20)*

`proxy.ts` currently treats any authenticated user as an admin for `/admin/*`,
and customers can self-register at `app/auth/sign-up` — so today every
registered customer can reach the admin area. Harmless while `/admin` is a
placeholder; a live gap the moment it renders order data.

**Decision: an `ADMIN_USER_IDS` allow-list in env**, checked in `proxy.ts`
against the JWT `sub` from the existing `getClaims()` call. No schema, no DB
round-trip per request on Lambda, a few lines of code. The trade is that adding
an admin needs a redeploy — fine for one baker.

If a second admin ever needs adding without a deploy, move to a `role` claim in
`app_metadata`: the check stays in the same place in `proxy.ts` and only its
source changes.

Keep the page-level check in `app/admin/page.tsx` as a fallback — `proxy.ts` is
the gate, not the only lock.
