-- Enums
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled');
CREATE TYPE fulfillment_type AS ENUM ('pickup', 'delivery');

-- ── Customers ─────────────────────────────────────────────────────────────────

CREATE TABLE customer (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid UNIQUE REFERENCES auth.users(id),  -- null for guest checkouts; UNIQUE = one customer per registered user (NULLs are distinct, so guests are unlimited)
  email        text,
  phone_number text,
  address      text,
  CHECK (user_id IS NOT NULL OR email IS NOT NULL)  -- every customer is reachable: an auth account or an email
);

-- ── Orders ────────────────────────────────────────────────────────────────────

CREATE TABLE "order" (
  id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid             NOT NULL REFERENCES customer(id),
  status           order_status     NOT NULL DEFAULT 'pending',
  total            numeric(10, 2)   NOT NULL,
  created_at       timestamptz      NOT NULL DEFAULT now(),
  fulfillment_type fulfillment_type NOT NULL,
  delivery_address text,  -- snapshot at checkout; null for pickup
  stripe_session_id text UNIQUE,  -- the Stripe Checkout Session this order came from; the webhook's idempotency key
  hold_expires_at  timestamptz,   -- while status = 'pending' this row IS the capacity hold; past this instant it stops consuming a slot, even if Stripe's `expired` event never arrived
  confirmation_sent_at timestamptz,  -- set once the confirmation email has gone out; makes the send idempotent across webhook replays and doubles as an admin resend affordance
  CHECK (fulfillment_type <> 'delivery' OR delivery_address IS NOT NULL)  -- delivery orders must have an address
);

-- A 'pending' order is a capacity hold written at checkout, not a real order.
-- Capacity counts it only while hold_expires_at is in the future; every admin,
-- reporting and email query must exclude 'pending' entirely.

CREATE TABLE order_item (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid           NOT NULL REFERENCES "order"(id),
  sanity_product_id text           NOT NULL,  -- references a Sanity product document _id (no FK; content lives in Sanity)
  variations        jsonb          NOT NULL DEFAULT '{}'::jsonb,  -- snapshot of chosen options, e.g. {"size":"6 Inch","flavour":"Vanilla","colour":"Cobalt"}
  quantity          integer        NOT NULL CHECK (quantity > 0),
  unit_price        numeric(10, 2) NOT NULL,  -- price snapshot at time of order, not a FK
  fulfillment_date  date           NOT NULL,  -- per-item pickup/delivery date; drives capacity accounting
  notes             text                      -- optional per-item note, e.g. "Happy 30th Sarah"
);

-- ── Capacity ──────────────────────────────────────────────────────────────────
-- Two independent axes:
--   1. CAPACITY  — how many cakes a pool can fulfil per week (capacity_pool + the
--      weekly_capacity weekday→pool map, with per-week count changes in
--      capacity_override).
--   2. OPENNESS  — whether a specific date is bookable at all (date_closure).
-- A date is bookable iff it is not closed AND its pool still has room that week.

-- A capacity pool: one weekly slot count, shared by whatever weekdays map to it.
-- e.g. Mon–Thu all map to one pool with max 1 = one cake across the whole block per week.
CREATE TABLE capacity_pool (
  key       text    PRIMARY KEY,       -- e.g. 'mon_thu', 'fri', 'sat', 'sun'
  max_items integer NOT NULL CHECK (max_items >= 0)
);

-- Maps each weekday to its pool. 0 = Mon … 6 = Sun. Weekdays sharing a pool_key
-- share that pool's single weekly count.
CREATE TABLE weekly_capacity (
  day_of_week smallint PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  pool_key    text     NOT NULL REFERENCES capacity_pool(key)
);

-- Change a pool's count for one specific week (rare — a big or quiet week).
-- week_start = the Monday of the target week. 0 = closed for that pool-week.
CREATE TABLE capacity_override (
  pool_key   text    NOT NULL REFERENCES capacity_pool(key),
  week_start date    NOT NULL,
  max_items  integer NOT NULL CHECK (max_items >= 0),
  note       text,
  PRIMARY KEY (pool_key, week_start)
);

-- Specific dates the baker is unavailable — presence = closed, independent of pool
-- capacity (e.g. away one Monday, but Tue–Thu still share the mon_thu pool's slot).
CREATE TABLE date_closure (
  date date PRIMARY KEY,
  note text
);
