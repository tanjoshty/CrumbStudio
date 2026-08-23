# Phase 1 — Capacity & availability

**Status:** **Done** — 2026-08-20
**Blocks:** Phase 2 (checkout cannot validate a date without this)

## Goal

One server-side answer to "which dates can a customer pick?", used both by the
date picker on the PDP and by checkout validation. Today `ProductDatePicker`
only enforces a 5-day minimum notice (`MIN_NOTICE_DAYS`) and knows nothing about
closures or how full a week already is.

## Prerequisites

- ~~Capacity data in the database.~~ **Done 2026-08-20** — `db/seed.sql` is
  applied and verified: `mon_thu: 1, fri: 2, sat: 3, sun: 2`, all seven weekdays
  mapped ([C0](./README.md#c0--capacity-of-record-set-2026-08-20)).
- Service-role Supabase client per [C3](./README.md#c3--server-side-supabase-access).

## Scope

**In:** a capacity service module, an availability endpoint, and wiring the PDP
date picker to it.

**Out:** admin UI for editing capacity (Phase 6b), and the reservation write
itself (Phase 2) — this phase only *reads* availability.

## Design notes

Read [C1](./README.md#c1--capacity-is-weekly-pools-not-cakes-per-day) first: capacity is
**weekly per pool**, not per day.

Availability for a date `d`:

1. `d` is not in `date_closure`.
2. `d >= today + MIN_NOTICE_DAYS`.
3. Its pool (`weekly_capacity` where `day_of_week = isoWeekday(d)`, 0 = Mon) has
   remaining room in `d`'s week: `effective_max - booked_that_week > 0`, where
   `effective_max` is `capacity_override(pool_key, week_start)` if a row exists,
   else `capacity_pool.max_items`.
4. `booked_that_week` counts `order_item.quantity` for items whose
   `fulfillment_date` falls in that pool-week, restricted to orders in a status
   that consumes capacity.

Per [C2](./README.md#c2--reservation-model-pending-order-rows-decided-2026-08-20),
capacity is consumed by `pending` (only while `hold_expires_at` is in the
future), `confirmed`, `in_progress`, `ready` and `completed`. `cancelled` never
counts, and neither does an expired `pending` row — so an abandoned checkout
stops blocking its slot even if Stripe's `expired` event never arrives. Put that
predicate in **one** place in `lib/capacity/service.ts`; two copies will drift,
and the bug stays invisible until a week silently over- or under-books.

`quantity` is always `1` per line for now
([C4](./README.md#c4--one-cake-per-line-add-sizekey-decided-2026-08-20)), but count `SUM(quantity)`
anyway so adding real quantity later needs no capacity change.

`week_start` is the Monday of the date's week, matching `capacity_override`.
Compute it in SQL (`date_trunc('week', d)::date` — Postgres weeks start Monday,
which lines up with day_of_week 0 = Mon) so the app and DB agree.

**Open question:** a single cart can hold several items for the same date. The
availability check must account for the whole cart at once, not item by item, or
a 2-cake cart can slip into a 1-slot week. Decide whether the endpoint takes a
date range and returns per-date remaining counts (recommended — lets the picker
grey out dates *and* lets checkout validate a whole cart) or a boolean per date.

## Tasks

- [x] ~~Run `db/seed.sql` in the Supabase SQL editor.~~ Done 2026-08-20.
- [x] Add `lib/supabase/admin.ts` — service-role client, server-only.
- [x] Add `lib/capacity/service.ts` with `getAvailability(from, to)` returning
      `{ date, remaining, closed }[]`, and `assertCapacity(items)` for a whole
      cart (reused by Phase 2).
- [x] Add `app/api/availability/route.ts` — `GET ?from=&to=`, month-shaped
      ranges, cached briefly.
- [x] Wire `ProductDatePicker` to fetch the visible month and pass full/closed
      dates to the `Calendar`'s `disabled` matcher alongside the existing
      `before: earliestDate`.
- [x] Move `MIN_NOTICE_DAYS` somewhere shared — checkout must enforce the same
      rule server-side, and two copies will drift.

## Files

- `lib/supabase/admin.ts` (new)
- `lib/capacity/service.ts` (new)
- `app/api/availability/route.ts` (new)
- `components/products/ProductDatePicker.tsx` (edit)

## Done when

- `GET /api/availability?from=…&to=…` returns correct remaining counts against
  seeded data, including a `capacity_override` week and a `date_closure` date.
- The PDP calendar greys out closed and full dates, and a full week's dates
  cannot be selected.
- `assertCapacity` rejects a cart whose combined items exceed a pool-week.

## Outcome

Shipped 2026-08-20. `tsc --noEmit` and `eslint` clean.

`getAvailability` returns `{ date, remaining, unavailable, reason, poolKey,
weekStart }` per day — `poolKey`/`weekStart` were added beyond the planned shape
so `checkCapacity` can group dates by pool-week without re-reading the weekday
map. `assertCapacity` was implemented as **`checkCapacity`**, returning a
discriminated result rather than throwing, so Phase 2 can map failures onto
per-line error messages instead of catching.

Verified against seeded data plus throwaway orders: the shared `mon_thu` slot
zeroing Tue/Wed/Thu from a single Tuesday booking, `date_closure` beating
available capacity, `capacity_override` replacing a pool's weekly count, expired
holds freeing their slot while live ones keep it, and cancelled orders never
counting. `checkCapacity` passed 13/13 cases, including the one that motivated
whole-cart checking: one cake Tuesday plus one Wednesday, correctly rejected
because both draw on the same single weekly slot.

**Known gap:** availability is read-then-check with no lock. Two simultaneous
checkouts can both see the last slot. That is Phase 2's problem to close, inside
the reservation write — see its task list.