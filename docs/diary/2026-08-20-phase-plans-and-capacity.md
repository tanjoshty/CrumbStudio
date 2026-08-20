# Session — 2026-08-20 — Phase plans + capacity backend

Covers one working session. It does not attempt to backfill the gap since the
2026-07-11 entry (the rename to Crumb Studio, the colour theme, and the checkout
stub all landed in between, uncommented). Two themes: the remaining build was
written down as phase plans in `docs/plans/`, and the first of those phases —
capacity and availability — was built and verified.

## Summary

`docs/plans/` now holds a plan per phase (1–7) plus an index of cross-cutting
decisions, deliberately as the editable source of truth for scope. Several
decisions that had been left implicit got settled: how a checkout reserves its
slot, whether the cart needs quantity, who counts as an admin, and how long a
hold lives. Phase 1 then shipped: a service that answers "which dates can a
customer pick?", an endpoint over it, and a date picker that greys out dates the
baker cannot make.

The database also stopped being theoretical — the schema was already applied,
the capacity seed went in with real numbers (8 cakes a week), and the two
Phase 2 columns landed early.

## Plans as a separate artifact

`docs/diary/` records what happened; `docs/plans/` records what is going to
happen. Splitting them means a phase doc can be edited when scope moves without
rewriting history, and `CLAUDE.md` now says the phase doc wins over `CLAUDE.md`
itself on questions of scope — it is edited by hand and will be newer.

Writing the plans surfaced more drift than expected:

- `CLAUDE.md` described capacity as "cakes per day" via
  `weekly_capacity.max_items`. The schema has worked on weekly pools since some
  point after the last diary entry. Corrected.
- The README listed "applying the schema to Supabase" as outstanding; all seven
  tables already existed.
- `NEXT_STRIPE_PUBLISHABLE_KEY` had no `NEXT_PUBLIC_` prefix, so it would never
  have reached the browser. Renamed before Phase 3 trips over it.
- `proxy.ts` treats any authenticated user as an admin, and customers can
  self-register — harmless while `/admin` is a placeholder, logged as a gap to
  close before it renders anything real.

## Decisions & justifications

### The pending order is the capacity hold

Both `CLAUDE.md` and the README claimed checkout "reserves the slot", but
nothing modelled a hold. Rather than a separate `capacity_hold` table, the
`order` row is written at session-creation with `status = 'pending'` and counts
toward capacity itself. A hold table would have duplicated the cart's exact
shape into a second table, plus a sweeper and a union in every capacity query,
to store what a pending order already stores.

The cost is that `"order"` now contains rows that are attempts rather than
orders, so every admin, reporting and email query must exclude `pending`. That
is a real, permanent tax, and it is written into Phases 2, 5 and 6 rather than
left to be rediscovered.

This also inverts what the README said about the webhook: it confirms an order
that checkout already wrote, rather than writing one.

### Holds expire after 45 minutes, and capacity enforces it, not the webhook

Stripe sessions last ~24 hours by default. With Mon–Thu sharing a single weekly
slot, a day-long hold means one abandoned checkout blocks half a week — so the
hold is 45 minutes, and the Stripe session's `expires_at` will be set to match.

More importantly the expiry lives in a column, not in an event handler.
`checkout.session.expired` can be missed entirely; the capacity query ignoring
pending rows past `hold_expires_at` is what actually guarantees an abandoned
checkout stops blocking a slot. The webhook is the tidy path, not the guarantee.

### One cake per line; `sizeKey` instead of a size label

`order_item.quantity` stays in the schema and is always written as `1`. Since
date and notes are already per-line, quantity would only help for two identical
cakes on the same date with the same note — not worth cart +/- controls and
line-merging. Capacity still counts `SUM(quantity)`, so adding it later needs no
change to the capacity math.

Separately, `CartItem` stores its size as a display label, but price lives on
the Sanity `sizes[]` member keyed by `_key`. Pricing off a label means renaming
a size in the Studio silently breaks checkout, so `sizeKey` gets added and
Phase 2 prices off the key.

### Admin is an env allow-list

`ADMIN_USER_IDS` checked in `proxy.ts` against the JWT `sub` already fetched by
`getClaims()`. No schema, no per-request DB round trip, and for one baker the
redeploy-to-add-an-admin cost is theoretical. The migration path if that changes
is a `role` claim in `app_metadata` — same check, different source.

## Phase 1 — what was built

- `lib/supabase/admin.ts` — service-role client. Every table has RLS on with
  zero policies, so the publishable key can read nothing; trusted paths go
  through here. Guarded to throw if it is ever called in the browser.
- `lib/capacity/constants.ts` — `MIN_NOTICE_DAYS`, shared between the picker and
  the server so the two cannot drift.
- `lib/capacity/service.ts` — `getAvailability(from, to)` and
  `checkCapacity(items)`.
- `app/api/availability/route.ts` — validated `GET`, range-capped at 92 days,
  uncached.
- `ProductDatePicker` — fetches the visible month and greys out closed and full
  dates.

### Capacity is checked per cart, not per item

`checkCapacity` takes the whole cart and spends from a shared pool-week budget.
Checking each line independently would let a cart with one cake on Tuesday and
one on Wednesday through, because each date reports one slot remaining — while
Mon–Thu share a *single* weekly slot between them. This is the specific bug the
pool model makes easy to write and invisible in testing, so it got an explicit
test case.

### `checkCapacity`, not `assertCapacity`

The plan called for a throwing `assertCapacity`. It returns a discriminated
result instead: Phase 2 needs to map failures onto per-line error messages the
checkout UI can render, and reaching into an exception for structured data is
worse than returning it.

### Bookings are read across whole weeks

A month-shaped query still reads bookings for the whole ISO weeks at its edges.
A pool's allowance is weekly, so a Monday booking outside the requested range
still consumes the slot a Wednesday inside it needs.

### Dates stay as `yyyy-MM-dd` strings

`fulfillment_date` is a Postgres `date` — a calendar day with no timezone. The
service parses to local dates and formats back with `format(d, 'yyyy-MM-dd')`,
never `toISOString()`, which would shift days across midnight west of Greenwich
and book the wrong date. Same reason the picker parses `${date}T00:00:00`
rather than passing the bare string to `new Date()`.

## Verification

Seeded capacity plus throwaway orders, then checked the numbers by hand:

| Case | Expected | Got |
|------|----------|-----|
| One booking Tue → Tue/Wed/Thu (shared `mon_thu`) | all 0 | all 0 |
| Expired hold + live hold on Friday (cap 2) | 1 | 1 |
| `date_closure` on a Saturday with capacity free | closed | closed |
| `capacity_override` raising Sunday 2 → 5 | 5 | 5 |
| Cancelled order on Sunday | not counted | not counted |

`checkCapacity` passed 13/13 cases, including Tue+Wed next week correctly
rejected as one shared slot. `tsc --noEmit` and `eslint` clean.

## Gotchas worth remembering

### The Data API had no exposed schemas

Every `supabase-js` call returned `PGRST002 / 503` while the SQL editor and MCP
`execute_sql` worked perfectly — because those talk to Postgres directly and
`supabase-js` goes through PostgREST. The log gave it away:

```
Failed to load the schema cache using db-schemas=pg_pgrst_no_exposed_schemas
{"code":"3F000","message":"schema \"pg_pgrst_no_exposed_schemas\" does not exist"}
```

`pg_pgrst_no_exposed_schemas` is Supabase's sentinel for "no schemas exposed to
the Data API". Re-exposing `public` in Project Settings → API fixed it
instantly. **If `supabase-js` fails wholesale but SQL works, check Exposed
Schemas before debugging code.**

### `_`-prefixed folders are private in the App Router

A scratch route at `app/api/_verify/route.ts` 404s — the leading underscore
marks a private folder excluded from routing.

### The React Compiler lint rule rejects `setState` in an effect body

`setIsLoading(true)` at the top of the picker's effect was flagged as a
cascading render. Fixed by keying the fetched result on the month and deriving
`isLoaded` from it, so there is one piece of state set only in the async
callback — better code than the version that tripped the rule.

## What's next

- **Phase 2 — checkout API.** The stub still returns `{ message: "hi" }`. Needs
  Sanity price recomputation, the `pending` reservation write, and the Stripe
  session.
- **Concurrency.** Availability is read-then-check with no lock, so two
  simultaneous checkouts can both see the last slot. It has to close inside
  Phase 2's reservation write — and since PostgREST cannot express
  `SELECT … FOR UPDATE`, that likely means a Postgres function or a unique
  constraint on the pool-week.
- **`sizeKey` on `CartItem`**, before Phase 2 can price a cart safely.
