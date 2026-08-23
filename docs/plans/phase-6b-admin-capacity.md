# Phase 6b — Admin capacity editor

**Status:** Not started
**Depends on:** Phase 1 (the capacity model) and Phase 6a (the admin shell + auth gate)

## Goal

Let the baker adjust capacity without touching SQL — the weekly pool counts, the
occasional busy/quiet week, and days they are closed. This is the intended home
for the [C0](./README.md#c0--capacity-of-record-set-2026-08-20) numbers; until it
exists they live in `db/seed.sql` and change by re-running it, which works but
does not survive contact with a real week.

## Current state

After [Phase 6a](./phase-6a-admin-orders.md) there is an admin shell with auth
and order views, but no capacity surface. The capacity model is fully built
(Phase 1): `capacity_pool`, `weekly_capacity`, `capacity_override`,
`date_closure`, and the availability/`capacity_remaining` functions read from
them.

## Scope

**In:** editing `capacity_pool` counts, adding/removing `capacity_override` rows
for a specific pool-week, and toggling `date_closure` dates. Reachable from the
Phase 6a admin nav.

**Out:** order management (Phase 6a). The weekday→pool *mapping*
(`weekly_capacity`) is treated as fixed config, not day-to-day editing — changing
which weekdays share a pool is rare enough to stay in `db/seed.sql`.

## Design notes

### The three levers

- **Pool counts** (`capacity_pool.max_items`) — the standing weekly capacity per
  pool (e.g. Sat = 3). The everyday knob.
- **Per-week overrides** (`capacity_override`, keyed `pool_key` + `week_start`
  Monday) — a one-week bump or cut without disturbing the standing number. `0`
  closes that pool for that week.
- **Date closures** (`date_closure`) — a specific day the baker is unavailable,
  independent of pool capacity. Presence = closed.

A date is bookable iff it is not closed **and** its pool has room that week —
unchanged from Phase 1; this phase only edits the inputs.

### Data access

Same as 6a: Server Components + service-role client for reads, server actions for
writes, validated server-side. Writes are small and low-frequency, so no
optimistic UI is needed — revalidate the path after a write.

### Guardrails

- `max_items >= 0` (DB CHECK already enforces it; validate client-side too).
- Editing a pool count or override should make the effect legible — show what a
  given week looks like after the change, since the weekly, per-pool model is not
  obvious at a glance.
- Removing an override reverts that pool-week to the standing count; make that
  clear rather than looking like data loss.

## Tasks

- [ ] Capacity section in the admin nav (added in 6a).
- [ ] Edit `capacity_pool` counts.
- [ ] Add / edit / remove `capacity_override` rows for a pool-week.
- [ ] Toggle `date_closure` dates (add with an optional note, remove).
- [ ] A read-back that shows the resulting availability for an upcoming week so
      the baker can see the effect of a change.
- [ ] Server actions with validation; revalidate after writes.

## Files

- `app/admin/capacity/*` (new)
- `components/admin/*` (extend)
- `lib/capacity/service.ts` (extend: reads + write helpers)

## Done when

- Pool counts, per-week overrides, and closures are all editable from the admin
  UI without running SQL.
- A change is reflected in the storefront availability picker.
- Invalid input (negative counts, a malformed week) is rejected server-side.
