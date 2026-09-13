BEGIN;
SELECT plan(12);

-- 1. Setup Data & Users
\set alice_id '''00000000-0000-0000-0000-000000000001'''::uuid
\set bob_id '''00000000-0000-0000-0000-000000000002'''::uuid

INSERT INTO auth.users (id) VALUES (:alice_id), (:bob_id) ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, display_name, status) VALUES 
  (:alice_id, 'Alice', 'active'),
  (:bob_id, 'Bob', 'disabled')
ON CONFLICT DO NOTHING;

-- 2. Test execution access
SELECT function_privs_are('public', 'set_daily_report', ARRAY['date', 'integer', 'integer'], 'anon', ARRAY[]::text[], 'anon has no execute privilege');
SELECT function_privs_are('public', 'set_daily_report', ARRAY['date', 'integer', 'integer'], 'authenticated', ARRAY['EXECUTE'], 'authenticated has execute privilege');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.set_daily_report('2026-09-12', 5, 0)$$,
  '42501',
  NULL,
  'anon cannot execute function due to revoked EXECUTE'
);

-- 3. Test as Bob (disabled)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);

SELECT throws_ok(
  $$SELECT public.set_daily_report('2026-09-12', 5, 0)$$,
  'P0001',
  'Profile is not active',
  'Disabled user cannot call set_daily_report'
);

-- 4. Test as Alice (active)
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-13', 5)$$,
  '42501',
  NULL,
  'Alice cannot direct INSERT anymore (grant revoked)'
);

SELECT throws_ok(
  $$UPDATE public.daily_reports SET resolved_count = 10 WHERE user_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'Alice cannot direct UPDATE anymore (grant revoked)'
);

SELECT results_eq(
  $$SELECT public.set_daily_report('2026-09-12', 5, 0)::jsonb$$,
  $$VALUES ('{"success": true, "revision": 1}'::jsonb)$$,
  'Alice can insert a new report with expected_revision 0'
);

SELECT results_eq(
  $$SELECT public.set_daily_report('2026-09-12', 10, 1)::jsonb$$,
  $$VALUES ('{"success": true, "revision": 2}'::jsonb)$$,
  'Alice can update her report with correct expected_revision 1'
);

SELECT results_eq(
  $$SELECT public.set_daily_report('2026-09-12', 15, 1)::jsonb$$,
  $$VALUES ('{"conflict": true, "success": false, "current_revision": 2}'::jsonb)$$,
  'Update with obsolete revision returns conflict'
);

SELECT results_eq(
  $$SELECT public.set_daily_report('2026-09-14', 5, 1)::jsonb$$,
  $$VALUES ('{"conflict": true, "success": false, "current_revision": 0}'::jsonb)$$,
  'Update a non-existent row returns conflict'
);

SELECT throws_ok(
  $$SELECT public.set_daily_report('2026-09-12', -1, 2)$$,
  'P0001',
  'resolved_count must be between 0 and 9999',
  'Function rejects negative count'
);

SELECT throws_ok(
  $$SELECT public.set_daily_report('2026-09-12', 5, -1)$$,
  'P0001',
  'expected_revision cannot be negative',
  'Function rejects negative expected_revision'
);

SELECT * FROM finish();
ROLLBACK;
