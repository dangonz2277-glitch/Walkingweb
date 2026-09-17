BEGIN;

SELECT plan(37);

-- Test 1: Table exists and has correct columns
SELECT has_table('public', 'report_entries', 'Table report_entries exists');
SELECT has_pk('public', 'report_entries', 'Table has a primary key');
SELECT has_column('public', 'report_entries', 'calls', 'Column calls exists');
SELECT has_column('public', 'report_entries', 'emails', 'Column emails exists');
SELECT has_column('public', 'report_entries', 'live_chats', 'Column live_chats exists');
SELECT has_column('public', 'report_entries', 'total', 'Column total exists');

-- Check explicit privileges on table
SELECT table_privs_are('public', 'report_entries', 'anon', ARRAY[]::text[], 'anon has NO privileges on report_entries');
SELECT table_privs_are('public', 'report_entries', 'authenticated', ARRAY['SELECT'], 'authenticated has EXACTLY SELECT on report_entries');

-- Check explicit privileges on RPC
SELECT function_privs_are('public', 'append_report_entry', ARRAY['integer', 'integer', 'integer', 'uuid'], 'anon', ARRAY[]::text[], 'anon has NO execution on append_report_entry');
SELECT function_privs_are('public', 'append_report_entry', ARRAY['integer', 'integer', 'integer', 'uuid'], 'authenticated', ARRAY['EXECUTE'], 'authenticated has EXACTLY EXECUTE on append_report_entry');
SELECT function_privs_are('public', 'append_report_entry', ARRAY['integer', 'integer', 'integer', 'uuid'], 'public', ARRAY[]::text[], 'PUBLIC has NO execution on append_report_entry');

-- Set up test data
INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'append_active@test.com'),
    ('22222222-2222-2222-2222-222222222222', 'append_inactive@test.com'),
    ('33333333-3333-3333-3333-333333333333', 'append_active2@test.com');

INSERT INTO public.profiles (user_id, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'active'),
    ('22222222-2222-2222-2222-222222222222', 'disabled'),
    ('33333333-3333-3333-3333-333333333333', 'active');

-- Test RLS is enabled
SELECT policies_are(
    'public',
    'report_entries',
    ARRAY['Usuarios pueden leer sus reportes de entrada'],
    'Only read policy is present'
);

-- Active user 1
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
SELECT set_config('role', 'authenticated', true);

-- Test NULL validations
SELECT throws_ok(
    $$ SELECT public.append_report_entry(NULL, 0, 0, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'p_calls no puede ser nulo',
    'Rechaza p_calls nulo'
);
SELECT throws_ok(
    $$ SELECT public.append_report_entry(0, NULL, 0, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'p_emails no puede ser nulo',
    'Rechaza p_emails nulo'
);
SELECT throws_ok(
    $$ SELECT public.append_report_entry(0, 0, NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'p_live_chats no puede ser nulo',
    'Rechaza p_live_chats nulo'
);
SELECT throws_ok(
    $$ SELECT public.append_report_entry(1, 1, 1, NULL) $$,
    'p_client_entry_id no puede ser nulo',
    'Rechaza p_client_entry_id nulo'
);

SELECT throws_ok(
    $$ SELECT public.append_report_entry(-1, 0, 0, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'Valores fuera de rango permitido (0-9999)',
    'Rechaza llamadas negativas'
);

SELECT throws_ok(
    $$ SELECT public.append_report_entry(10000, 0, 0, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'Valores fuera de rango permitido (0-9999)',
    'Rechaza llamadas > 9999'
);

SELECT throws_ok(
    $$ SELECT public.append_report_entry(0, 0, 0, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'El total debe ser mayor que cero',
    'Rechaza totales de cero'
);

-- First valid insert
SELECT lives_ok(
    $$ SELECT public.append_report_entry(5, 3, 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'Inserta registro válido correctamente'
);

-- Verify stored data and calculated total
SELECT results_eq(
    $$ SELECT calls, emails, live_chats, total FROM public.report_entries WHERE client_entry_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
    $$ VALUES (5, 3, 2, 10) $$,
    'La tabla calculó correctamente el total y lo almacenó'
);

-- Second valid insert with same quantities but different UUID (should be allowed on the same day)
SELECT lives_ok(
    $$ SELECT public.append_report_entry(5, 3, 2, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
    'Permite múltiples registros en el mismo día con diferentes UUIDs'
);

-- Second valid insert with DIFFERENT quantities and different UUID (should be allowed on the same day)
SELECT lives_ok(
    $$ SELECT public.append_report_entry(1, 1, 1, 'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
    'Permite múltiples registros en el mismo día con cantidades diferentes'
);

-- Verify multiple rows exist
SELECT results_eq(
    $$ SELECT COUNT(*)::int FROM public.report_entries WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
    $$ VALUES (3) $$,
    'El usuario activo ve 3 reportes'
);

-- Idempotency Test: Same exact payload as the first insert
SELECT lives_ok(
    $$ SELECT public.append_report_entry(5, 3, 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'Reintento idempotente con el mismo payload no falla'
);

SELECT results_eq(
    $$ SELECT COUNT(*)::int FROM public.report_entries WHERE user_id = '11111111-1111-1111-1111-111111111111' $$,
    $$ VALUES (3) $$,
    'El reintento idempotente no aumenta el número de filas'
);

-- Idempotency Conflict: Same UUID, different payload
SELECT throws_ok(
    $$ SELECT public.append_report_entry(6, 3, 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'Conflicto: El mismo UUID fue provisto con datos diferentes',
    'Falla cuando el payload no coincide con el registro previo de ese UUID'
);

-- Check direct modification constraints
SELECT throws_ok(
    $$ INSERT INTO public.report_entries (user_id, client_entry_id, work_date, calls, emails, live_chats) VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', CURRENT_DATE, 1, 1, 1) $$,
    '42501',
    NULL,
    'authenticated no tiene permiso de INSERT directo'
);

SELECT throws_ok(
    $$ UPDATE public.report_entries SET calls = 10 $$,
    '42501',
    NULL,
    'authenticated no tiene permiso de UPDATE directo'
);

SELECT throws_ok(
    $$ DELETE FROM public.report_entries $$,
    '42501',
    NULL,
    'authenticated no tiene permiso de DELETE directo'
);

-- Switch to Active User 2
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT results_eq(
    $$ SELECT COUNT(*)::int FROM public.report_entries $$,
    $$ VALUES (0) $$,
    'Usuario activo 2 no puede leer las entradas del usuario 1'
);

SELECT lives_ok(
    $$ SELECT public.append_report_entry(2, 2, 2, '99999999-9999-9999-9999-999999999999') $$,
    'Usuario activo 2 puede insertar su propia entrada'
);

SELECT results_eq(
    $$ SELECT COUNT(*)::int FROM public.report_entries $$,
    $$ VALUES (1) $$,
    'Usuario activo 2 lee exactamente su única entrada'
);

-- Switch to inactive user
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
    $$ SELECT public.append_report_entry(1, 1, 1, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') $$,
    'Profile is not active',
    'Usuario inactivo no puede insertar'
);

SELECT is(
    (SELECT COUNT(*) FROM public.report_entries),
    0::bigint,
    'Usuario inactivo no puede leer nada'
);

-- Switch to anon
SELECT set_config('role', 'anon', true);
SELECT throws_ok(
    $$ SELECT public.append_report_entry(1, 1, 1, 'ffffffff-ffff-ffff-ffff-ffffffffffff') $$,
    '42501',
    NULL,
    'anon no tiene permisos de ejecución sobre la RPC'
);

SELECT throws_ok(
    $$ SELECT COUNT(*) FROM public.report_entries $$,
    '42501',
    NULL,
    'anon no puede leer la tabla'
);

-- Drop test data
SELECT set_config('role', 'postgres', true);
DELETE FROM auth.users WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

SELECT * FROM finish();
ROLLBACK;
