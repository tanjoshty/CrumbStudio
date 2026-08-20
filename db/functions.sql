-- Capacity + order-placement functions.
--
-- Run in the Supabase SQL editor after schema.sql. Re-runnable: everything here
-- is CREATE OR REPLACE.
--
-- Why these live in SQL rather than TypeScript: reserving the last slot in a
-- pool-week is a read-then-write race. Two checkouts can both read "1 left" and
-- both insert. PostgREST cannot express SELECT … FOR UPDATE, so the check and
-- the insert have to happen together, inside one transaction, in the database.
-- Availability reads go through the same functions so the rules cannot drift
-- between the calendar and the reservation.

-- ── What consumes a slot ──────────────────────────────────────────────────────
-- One definition, used by both the availability read and the reservation write.
--
-- Everything except 'cancelled' consumes capacity, and a 'pending' order only
-- while its hold is live: past hold_expires_at an abandoned checkout frees its
-- slot whether or not Stripe's checkout.session.expired event ever arrived.
CREATE OR REPLACE VIEW capacity_booking AS
SELECT
  oi.id,
  oi.quantity,
  oi.fulfillment_date,
  wc.pool_key,
  date_trunc('week', oi.fulfillment_date)::date AS week_start  -- Postgres weeks start Monday, matching day_of_week 0 = Mon
FROM order_item oi
JOIN "order" o ON o.id = oi.order_id
JOIN weekly_capacity wc
  ON wc.day_of_week = (EXTRACT(isodow FROM oi.fulfillment_date)::int - 1)
WHERE o.status <> 'cancelled'
  AND (o.status <> 'pending' OR o.hold_expires_at IS NULL OR o.hold_expires_at > now());

-- Slots left in one pool-week. NULL if the pool does not exist.
CREATE OR REPLACE FUNCTION capacity_remaining(p_pool_key text, p_week_start date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    0,
    COALESCE(co.max_items, cp.max_items)
      - COALESCE((
          SELECT SUM(b.quantity)::int
          FROM capacity_booking b
          WHERE b.pool_key = p_pool_key AND b.week_start = p_week_start
        ), 0)
  )
  FROM capacity_pool cp
  LEFT JOIN capacity_override co
    ON co.pool_key = cp.key AND co.week_start = p_week_start
  WHERE cp.key = p_pool_key;
$$;

-- Per-date availability over a range. Openness and capacity are independent:
-- a date can be closed while its pool still has room, and vice versa.
CREATE OR REPLACE FUNCTION capacity_availability(p_from date, p_to date)
RETURNS TABLE (
  date       date,
  pool_key   text,
  week_start date,
  remaining  integer,
  closed     boolean
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    d::date,
    wc.pool_key,
    date_trunc('week', d)::date,
    COALESCE(capacity_remaining(wc.pool_key, date_trunc('week', d)::date), 0),
    EXISTS (SELECT 1 FROM date_closure dc WHERE dc.date = d::date)
  FROM generate_series(p_from, p_to, interval '1 day') d
  LEFT JOIN weekly_capacity wc
    ON wc.day_of_week = (EXTRACT(isodow FROM d)::int - 1);
$$;

-- ── Placing the hold ──────────────────────────────────────────────────────────
-- Writes the order + items as 'pending'. That row IS the capacity hold.
--
-- p_items is a jsonb array of:
--   {sanity_product_id, variations, quantity, unit_price, fulfillment_date, notes}
--
-- Raises with a machine-readable prefix the caller parses:
--   CAPACITY_FULL:<pool_key>:<week_start>
--   DATE_CLOSED:<date>
--   UNKNOWN_DATE:<date>     -- weekday with no pool mapped
CREATE OR REPLACE FUNCTION place_order_hold(
  p_customer_id      uuid,
  p_fulfillment_type fulfillment_type,
  p_delivery_address text,
  p_total            numeric,
  p_hold_expires_at  timestamptz,
  p_items            jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  r          record;
BEGIN
  -- Lock every pool-week this order touches, in a deterministic order so two
  -- concurrent multi-week carts cannot deadlock against each other. Advisory
  -- locks are transaction-scoped: they release on commit or rollback.
  FOR r IN
    SELECT DISTINCT
      wc.pool_key,
      date_trunc('week', (i->>'fulfillment_date')::date)::date AS week_start
    FROM jsonb_array_elements(p_items) i
    JOIN weekly_capacity wc
      ON wc.day_of_week = (EXTRACT(isodow FROM (i->>'fulfillment_date')::date)::int - 1)
    ORDER BY 1, 2
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(r.pool_key || '|' || r.week_start::text, 0));
  END LOOP;

  -- A weekday with no pool mapped is not bookable. Fail loudly rather than
  -- treating an incomplete weekly_capacity table as unlimited.
  SELECT (i->>'fulfillment_date') INTO r
  FROM jsonb_array_elements(p_items) i
  WHERE NOT EXISTS (
    SELECT 1 FROM weekly_capacity wc
    WHERE wc.day_of_week = (EXTRACT(isodow FROM (i->>'fulfillment_date')::date)::int - 1)
  )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_DATE:%', r;
  END IF;

  -- Closures are checked here too, not just in the app: a date can be closed
  -- between the calendar render and the checkout POST.
  FOR r IN
    SELECT DISTINCT (i->>'fulfillment_date')::date AS d
    FROM jsonb_array_elements(p_items) i
    JOIN date_closure dc ON dc.date = (i->>'fulfillment_date')::date
  LOOP
    RAISE EXCEPTION 'DATE_CLOSED:%', r.d;
  END LOOP;

  -- The authoritative capacity check, inside the lock. Grouped by pool-week
  -- because several lines on different days can draw on one weekly allowance.
  FOR r IN
    SELECT
      wc.pool_key,
      date_trunc('week', (i->>'fulfillment_date')::date)::date AS week_start,
      SUM((i->>'quantity')::int)                               AS requested
    FROM jsonb_array_elements(p_items) i
    JOIN weekly_capacity wc
      ON wc.day_of_week = (EXTRACT(isodow FROM (i->>'fulfillment_date')::date)::int - 1)
    GROUP BY 1, 2
  LOOP
    IF COALESCE(capacity_remaining(r.pool_key, r.week_start), 0) < r.requested THEN
      RAISE EXCEPTION 'CAPACITY_FULL:%:%', r.pool_key, r.week_start;
    END IF;
  END LOOP;

  INSERT INTO "order" (
    customer_id, status, total, fulfillment_type, delivery_address, hold_expires_at
  )
  VALUES (
    p_customer_id, 'pending', p_total, p_fulfillment_type, p_delivery_address, p_hold_expires_at
  )
  RETURNING id INTO v_order_id;

  INSERT INTO order_item (
    order_id, sanity_product_id, variations, quantity, unit_price, fulfillment_date, notes
  )
  SELECT
    v_order_id,
    i->>'sanity_product_id',
    COALESCE(i->'variations', '{}'::jsonb),
    (i->>'quantity')::int,
    (i->>'unit_price')::numeric,
    (i->>'fulfillment_date')::date,
    NULLIF(i->>'notes', '')
  FROM jsonb_array_elements(p_items) i;

  RETURN v_order_id;
END;
$$;

-- ── Access ────────────────────────────────────────────────────────────────────
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which through
-- PostgREST would let an anonymous browser call place_order_hold directly and
-- mint orders. Only the server (service_role) may call any of this.
REVOKE ALL ON capacity_booking FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON capacity_booking TO service_role;

REVOKE ALL ON FUNCTION capacity_remaining(text, date)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capacity_availability(date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION place_order_hold(uuid, fulfillment_type, text, numeric, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION capacity_remaining(text, date)    TO service_role;
GRANT EXECUTE ON FUNCTION capacity_availability(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION place_order_hold(uuid, fulfillment_type, text, numeric, timestamptz, jsonb)
  TO service_role;
