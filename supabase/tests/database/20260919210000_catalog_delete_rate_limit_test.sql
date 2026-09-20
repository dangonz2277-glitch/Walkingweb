BEGIN;

SELECT plan(29);

-- Privilegios de tabla
SELECT table_privs_are(
    'public', 'catalog_delete_rate_limit', 'public', ARRAY[]::text[],
    'public no debe tener acceso a catalog_delete_rate_limit'
);
SELECT table_privs_are(
    'public', 'catalog_delete_rate_limit', 'anon', ARRAY[]::text[],
    'anon no debe tener acceso a catalog_delete_rate_limit'
);
SELECT table_privs_are(
    'public', 'catalog_delete_rate_limit', 'authenticated', ARRAY[]::text[],
    'authenticated no debe tener acceso a catalog_delete_rate_limit'
);
SELECT table_privs_are(
    'public', 'catalog_delete_rate_limit', 'service_role', ARRAY[]::text[],
    'service_role no debe tener acceso directo a catalog_delete_rate_limit'
);

-- Privilegios de funciones (check)
SELECT function_privs_are(
    'public', 'check_catalog_delete_rate_limit', ARRAY['text', 'integer', 'interval'], 'public', ARRAY[]::text[],
    'public no puede ejecutar check'
);
SELECT function_privs_are(
    'public', 'check_catalog_delete_rate_limit', ARRAY['text', 'integer', 'interval'], 'anon', ARRAY[]::text[],
    'anon no puede ejecutar check'
);
SELECT function_privs_are(
    'public', 'check_catalog_delete_rate_limit', ARRAY['text', 'integer', 'interval'], 'authenticated', ARRAY[]::text[],
    'authenticated no puede ejecutar check'
);
SELECT function_privs_are(
    'public', 'check_catalog_delete_rate_limit', ARRAY['text', 'integer', 'interval'], 'service_role', ARRAY['EXECUTE'],
    'service_role DEBE poder ejecutar check'
);

-- Privilegios de funciones (reset)
SELECT function_privs_are(
    'public', 'reset_catalog_delete_rate_limit', ARRAY['text'], 'public', ARRAY[]::text[],
    'public no puede ejecutar reset'
);
SELECT function_privs_are(
    'public', 'reset_catalog_delete_rate_limit', ARRAY['text'], 'anon', ARRAY[]::text[],
    'anon no puede ejecutar reset'
);
SELECT function_privs_are(
    'public', 'reset_catalog_delete_rate_limit', ARRAY['text'], 'authenticated', ARRAY[]::text[],
    'authenticated no puede ejecutar reset'
);
SELECT function_privs_are(
    'public', 'reset_catalog_delete_rate_limit', ARRAY['text'], 'service_role', ARRAY['EXECUTE'],
    'service_role DEBE poder ejecutar reset'
);

-- Pruebas como anon
SET ROLE anon;
SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit('test1') $$,
    '42501',
    NULL,
    'anon rechazada por privilegios'
);
RESET ROLE;

-- Pruebas como authenticated
SET ROLE authenticated;
SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit('test2') $$,
    '42501',
    NULL,
    'authenticated rechazada por privilegios'
);
RESET ROLE;

-- Argumentos invalidos
SET ROLE service_role;

SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit(NULL) $$,
    'P0001',
    'client_ident invalido',
    'client_ident nulo rechaza con excepción'
);

SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit('') $$,
    'P0001',
    'client_ident invalido',
    'client_ident vacío rechaza con excepción'
);

SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit(repeat('a', 257)) $$,
    '23514',
    NULL,
    'client_ident superior al límite rechazado'
);

SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit('test_ident', 0, '1 minute'::interval) $$,
    'P0001',
    'max_attempts invalido',
    'max_attempts = 0 rechazado'
);

SELECT throws_ok(
    $$ SELECT public.check_catalog_delete_rate_limit('test_ident', 5, '0'::interval) $$,
    'P0001',
    'window_interval invalido',
    'window_interval = 0 rechazado'
);

-- Limite y ventana (service_role)
SELECT ok(
    public.check_catalog_delete_rate_limit('test_ident', 2, '1 minute'::interval),
    'Primer intento permitido'
);
SELECT ok(
    public.check_catalog_delete_rate_limit('test_ident', 2, '1 minute'::interval),
    'Segundo intento permitido'
);

-- Demuestra ventana fija
RESET ROLE;
CREATE TEMP TABLE temp_window AS SELECT window_start FROM public.catalog_delete_rate_limit WHERE ident_hash = 'test_ident';
SET ROLE service_role;

SELECT is(
    public.check_catalog_delete_rate_limit('test_ident', 2, '1 minute'::interval),
    false,
    'Tercer intento bloqueado (limite 2)'
);

RESET ROLE;
SELECT is(
    (SELECT window_start FROM public.catalog_delete_rate_limit WHERE ident_hash = 'test_ident'),
    (SELECT window_start FROM temp_window),
    'una llamada bloqueada no cambia window_start'
);

-- Conserva el numero de intentos y una llamada bloqueada no cambia window_start
SELECT is(attempts, 3, 'el contador conserva el número exacto de intentos') FROM public.catalog_delete_rate_limit WHERE ident_hash = 'test_ident';

-- Engañamos a window_start
UPDATE public.catalog_delete_rate_limit SET window_start = pg_catalog.clock_timestamp() - '2 minutes'::interval WHERE ident_hash = 'test_ident';

SET ROLE service_role;
SELECT ok(
    public.check_catalog_delete_rate_limit('test_ident', 2, '1 minute'::interval),
    'Intento permitido luego de expirar la ventana (reinicia a 1)'
);

RESET ROLE;
SELECT is(attempts, 1, 'expiración reinicia attempts en 1') FROM public.catalog_delete_rate_limit WHERE ident_hash = 'test_ident';

SET ROLE service_role;
-- Prueba de reset
SELECT lives_ok(
    $$ SELECT public.reset_catalog_delete_rate_limit('test_ident') $$,
    'service_role puede ejecutar reset'
);

RESET ROLE;
SELECT is(count(*)::int, 0, 'reset elimina realmente el contador') FROM public.catalog_delete_rate_limit WHERE ident_hash = 'test_ident';

SET ROLE service_role;
SELECT ok(
    public.check_catalog_delete_rate_limit('test_ident', 2, '1 minute'::interval),
    'después de reset, el próximo intento vuelve a ser el primero'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
