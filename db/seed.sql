-- Seed data. Run once in the Supabase SQL editor after schema.sql.
-- Re-runnable: upserts, so re-running just updates the values.

-- Capacity pools — how many cakes each pool can fulfil per week.
-- Mon–Thu share ONE pool (one cake across the whole block); Fri/Sat/Sun are their own.
-- Real capacity as of 2026-08-20. The baker will edit these from the admin
-- panel (Phase 6); until then, change them here and re-run.
INSERT INTO capacity_pool (key, max_items) VALUES
  ('mon_thu', 1),
  ('fri', 2),
  ('sat', 3),
  ('sun', 2)
ON CONFLICT (key) DO UPDATE SET max_items = EXCLUDED.max_items;

-- Weekday → pool mapping. 0 = Mon, 1 = Tue, … 6 = Sun.
INSERT INTO weekly_capacity (day_of_week, pool_key) VALUES
  (0, 'mon_thu'), (1, 'mon_thu'), (2, 'mon_thu'), (3, 'mon_thu'),
  (4, 'fri'), (5, 'sat'), (6, 'sun')
ON CONFLICT (day_of_week) DO UPDATE SET pool_key = EXCLUDED.pool_key;

-- capacity_override (per pool-week count changes) and date_closure (baker away /
-- holidays) are ad-hoc — not seeded. Add them as needed:
--   INSERT INTO date_closure (date, note) VALUES ('2026-07-20', 'Baker away');
--   INSERT INTO capacity_override (pool_key, week_start, max_items, note)
--     VALUES ('sat', '2026-12-21', 8, 'Christmas week — extra Saturday capacity');
