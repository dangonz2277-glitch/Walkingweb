BEGIN;
SELECT plan(28);

-- 1. Setup Data & Users
\set alice_id '''00000000-0000-0000-0000-000000000001'''::uuid
\set bob_id '''00000000-0000-0000-0000-000000000002'''::uuid

INSERT INTO auth.users (id) VALUES (:alice_id), (:bob_id);

INSERT INTO public.profiles (user_id, display_name, status) VALUES 
  (:alice_id, 'Alice', 'active'),
  (:bob_id, 'Bob', 'disabled');

INSERT INTO public.daily_reports (id, user_id, work_date, resolved_count, updated_at) 
VALUES ('11111111-1111-1111-1111-111111111111', :bob_id, '2026-09-10', 3, now() - interval '1 hour');

INSERT INTO public.daily_reports (id, user_id, work_date, resolved_count, updated_at) 
VALUES ('22222222-2222-2222-2222-222222222222', :alice_id, '2026-09-12', 10, '2026-09-12 10:00:00+00');

-- 2. Metadata & Grant Assertions (4 assertions)
SELECT table_privs_are('public', 'profiles', 'anon', ARRAY[]::text[], 'anon has NO privileges on profiles');
SELECT table_privs_are('public', 'daily_reports', 'anon', ARRAY[]::text[], 'anon has NO privileges on daily_reports');
SELECT table_privs_are('public', 'profiles', 'authenticated', ARRAY['SELECT'], 'authenticated has ONLY SELECT on profiles (no UPDATE/DELETE)');
SELECT table_privs_are('public', 'daily_reports', 'authenticated', ARRAY['SELECT'], 'authenticated has ONLY SELECT on daily_reports (no INSERT/UPDATE/DELETE)');

-- 3. Test as Anonymous (3 assertions)
SET LOCAL ROLE anon;

SELECT throws_ok(
  'SELECT * FROM public.profiles',
  '42501',
  NULL,
  'Anon cannot SELECT profiles (grant revoked)'
);

SELECT throws_ok(
  'SELECT * FROM public.daily_reports',
  '42501',
  NULL,
  'Anon cannot SELECT daily_reports (grant revoked)'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-12', 5)$$,
  '42501',
  NULL,
  'Anon cannot insert into daily_reports'
);

-- 4. Test Constraints & DB structure (Admin privileged) (5 assertions)
RESET ROLE;
-- Superuser tests for table constraints since normal users cannot INSERT
SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-13', -1)$$,
  '23514',
  NULL,
  'Table rejects negative resolved_count'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-13', 10000)$$,
  '23514',
  NULL,
  'Table rejects resolved_count > 9999'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-13', '5.5')$$,
  '22P02',
  NULL,
  'Table rejects fractional resolved_count (invalid input syntax for integer)'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count, revision) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-13', 10, -1)$$,
  '23514',
  NULL,
  'Table rejects negative revision'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000001', '2026-09-12', 5)$$,
  '23505',
  NULL,
  'Table rejects duplicate user_id and work_date'
);

-- 5. Test as Authenticated (Alice - active) (8 assertions)
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  'SELECT user_id FROM public.profiles',
  $$VALUES ('00000000-0000-0000-0000-000000000001'::uuid)$$,
  'Alice can only read her own profile via RLS'
);

SELECT results_eq(
  'SELECT id FROM public.daily_reports',
  $$VALUES ('22222222-2222-2222-2222-222222222222'::uuid)$$,
  'Alice can only read her own report via RLS'
);

SELECT throws_ok(
  $$UPDATE public.profiles SET status = 'disabled' WHERE user_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'Alice cannot update profiles.status (grant revoked)'
);

SELECT throws_ok(
  $$UPDATE public.profiles SET display_name = 'Alicia' WHERE user_id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'Alice cannot update profiles.display_name (grant revoked)'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (id, user_id, work_date, resolved_count) VALUES ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000002', '2026-09-12', 10)$$,
  '42501',
  NULL,
  'Alice cannot insert a report for Bob (grant revoked)'
);

SELECT throws_ok(
  $$UPDATE public.daily_reports SET resolved_count = 11 WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  NULL,
  'Alice cannot update Bob''s report (grant revoked)'
);

SELECT throws_ok(
  $$UPDATE public.daily_reports SET resolved_count = 11 WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  NULL,
  'Alice cannot update her own report directly (grant revoked)'
);

SELECT throws_ok(
  $$DELETE FROM public.daily_reports WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  NULL,
  'Alice cannot delete her own report (grant revoked)'
);


-- 6. Test as Authenticated (Bob - disabled) (6 assertions)
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  'SELECT user_id FROM public.profiles',
  $$VALUES ('00000000-0000-0000-0000-000000000002'::uuid)$$,
  'Bob (disabled) can read ONLY his own profile'
);

SELECT is_empty(
  $$SELECT id FROM public.daily_reports WHERE user_id = '00000000-0000-0000-0000-000000000002'$$,
  'Bob (disabled) cannot read his own pre-existing report due to RLS'
);

SELECT throws_ok(
  $$UPDATE public.daily_reports SET resolved_count = 99 WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  NULL,
  'Bob (disabled) cannot update his existing report (grant revoked)'
);

SELECT throws_ok(
  $$UPDATE public.daily_reports SET resolved_count = 99 WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  NULL,
  'Bob cannot update Alice''s row (grant revoked)'
);

SELECT throws_ok(
  $$DELETE FROM public.daily_reports WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  NULL,
  'Bob cannot DELETE even his own row (grant revoked)'
);

SELECT throws_ok(
  $$INSERT INTO public.daily_reports (id, user_id, work_date, resolved_count) VALUES ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000002', '2026-09-12', 10)$$,
  '42501',
  NULL,
  'Bob (disabled) cannot insert reports (grant revoked)'
);

-- 7. Test Two active users with the same date AND SAME TOTAL (2 assertions)
RESET ROLE;
-- Make Bob active
UPDATE public.profiles SET status = 'active' WHERE user_id = :bob_id;

-- Alice report is 10. Let's make Bob create one with 10 for the same date.
-- Because INSERT is revoked, we do it via Admin to test the table constraint allows it.
SELECT lives_ok(
  $$INSERT INTO public.daily_reports (user_id, work_date, resolved_count) VALUES ('00000000-0000-0000-0000-000000000002', '2026-09-12', 10)$$,
  'Admin can insert Bob report for the same date and same total (10) as Alice'
);

-- Test updated_at trigger properly
PREPARE trigger_update AS 
  UPDATE public.daily_reports SET resolved_count = 11 WHERE id = '22222222-2222-2222-2222-222222222222' RETURNING updated_at;
SELECT results_ne(
  'trigger_update',
  $$VALUES ('2026-09-12 10:00:00+00'::timestamptz)$$,
  'updated_at trigger works automatically on UPDATE'
);

SELECT * FROM finish();
ROLLBACK;
