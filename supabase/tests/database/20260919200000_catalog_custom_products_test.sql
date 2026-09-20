BEGIN;

SELECT plan(55);

-- 1. Tabla y columnas esenciales
SELECT has_table('public', 'catalog_custom_products', 'Debe existir catalog_custom_products');
SELECT has_pk('public', 'catalog_custom_products', 'Debe tener una clave primaria');
SELECT col_is_pk('public', 'catalog_custom_products', 'id', 'id es PRIMARY KEY');

-- Tipos
SELECT col_type_is('public', 'catalog_custom_products', 'id', 'uuid', 'id es uuid');
SELECT col_type_is('public', 'catalog_custom_products', 'request_id', 'uuid', 'request_id es uuid');
SELECT col_type_is('public', 'catalog_custom_products', 'cat', 'text', 'cat es text');
SELECT col_type_is('public', 'catalog_custom_products', 'name', 'text', 'name es text');
SELECT col_type_is('public', 'catalog_custom_products', 'model', 'text', 'model es text');
SELECT col_type_is('public', 'catalog_custom_products', 'capacity', 'text', 'capacity es text');
SELECT col_type_is('public', 'catalog_custom_products', 'links', 'jsonb', 'links es jsonb');
SELECT col_type_is('public', 'catalog_custom_products', 'issues', 'jsonb', 'issues es jsonb');
SELECT col_type_is('public', 'catalog_custom_products', 'revision', 'integer', 'revision es integer');
SELECT col_type_is('public', 'catalog_custom_products', 'created_at', 'timestamp with time zone', 'created_at es timestamptz');
SELECT col_type_is('public', 'catalog_custom_products', 'updated_at', 'timestamp with time zone', 'updated_at es timestamptz');
SELECT col_type_is('public', 'catalog_custom_products', 'deleted_at', 'timestamp with time zone', 'deleted_at es timestamptz');

-- Defaults
SELECT col_has_default('public', 'catalog_custom_products', 'id', 'id tiene default');
SELECT col_has_default('public', 'catalog_custom_products', 'created_at', 'created_at tiene default');
SELECT col_has_default('public', 'catalog_custom_products', 'updated_at', 'updated_at tiene default');
SELECT col_default_is('public', 'catalog_custom_products', 'revision', 0, 'revision debe ser 0 por defecto');
SELECT col_default_is('public', 'catalog_custom_products', 'links', '[]'::jsonb, 'links default []');
SELECT col_default_is('public', 'catalog_custom_products', 'issues', '[]'::jsonb, 'issues default []');
SELECT col_default_is('public', 'catalog_custom_products', 'speed', '', 'speed default empty');

-- Constraints Especiales
SELECT col_is_unique('public', 'catalog_custom_products', 'request_id', 'request_id es UNIQUE');

-- 2. Privilegios RLS y de roles
SELECT results_eq(
    $$ SELECT relrowsecurity FROM pg_class WHERE relname = 'catalog_custom_products' $$,
    ARRAY[true],
    'RLS debe estar habilitado para catalog_custom_products'
);

SELECT table_privs_are('public', 'catalog_custom_products', 'public', ARRAY[]::text[], 'PUBLIC sin privilegios');
SELECT table_privs_are('public', 'catalog_custom_products', 'anon', ARRAY[]::text[], 'anon sin privilegios');
SELECT table_privs_are('public', 'catalog_custom_products', 'authenticated', ARRAY[]::text[], 'authenticated sin privilegios');
SELECT table_privs_are('public', 'catalog_custom_products', 'service_role', ARRAY['INSERT', 'SELECT', 'UPDATE'], 'service_role con privilegios exactos');

-- Set role to service_role to test operational logic
SET ROLE service_role;

-- 3. Inserciones válidas
SELECT lives_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000001', 'Cat', 'Name', 'Model', 'Cap') $$,
    'inserción administrativa válida sin issues'
);

SELECT lives_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, issues) VALUES ('00000000-0000-0000-0000-000000000002', 'Cat', 'Name', 'Model', 'Cap', '[{"code":"E01", "name":"Error 1"}, {"code":"E02", "name":"Error 2"}]'::jsonb) $$,
    'inserción administrativa válida con varios issues'
);

-- 4. Constraints en Arrays
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, links) VALUES ('00000000-0000-0000-0000-000000000003', 'Cat', 'Name', 'Model', 'Cap', '{"url":"x"}'::jsonb) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_links_is_array"',
    'links debe ser arreglo'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, issues) VALUES ('00000000-0000-0000-0000-000000000004', 'Cat', 'Name', 'Model', 'Cap', '{"code":"x"}'::jsonb) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_issues_is_array"',
    'issues debe ser arreglo'
);

-- 5. Constraints Not Empty
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000005', '   ', 'Name', 'Model', 'Cap') $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_cat_not_empty"',
    'rechazo de cat vacío'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000006', 'Cat', '   ', 'Model', 'Cap') $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_name_not_empty"',
    'rechazo de name vacío'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000007', 'Cat', 'Name', '', 'Cap') $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_model_not_empty"',
    'rechazo de model vacío'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000008', 'Cat', 'Name', 'Model', '   ') $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_capacity_not_empty"',
    'rechazo de capacity vacío'
);

-- Revision
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, revision) VALUES ('00000000-0000-0000-0000-000000000009', 'Cat', 'Name', 'Model', 'Cap', -1) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_revision_non_negative"',
    'rechazo de revision negativa'
);

-- Duplicidad request_id
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000001', 'Cat', 'Name', 'Model', 'Cap') $$,
    'duplicate key value violates unique constraint "catalog_custom_products_request_id_key"',
    'request_id duplicado rechazado'
);

-- Duplicidad modelos
SELECT lives_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000010', 'Cat', 'Name', 'Model', 'Cap') $$,
    'modelos iguales permitidos cuando request_id es diferente'
);

-- Cobertura de límites
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES ('00000000-0000-0000-0000-000000000011', 'Cat', repeat('N', 201), 'Model', 'Cap') $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_name_length"',
    'name superior a 200 caracteres es rechazado'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, notes) VALUES ('00000000-0000-0000-0000-000000000012', 'Cat', 'Name', 'Model', 'Cap', repeat('N', 5001)) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_notes_length"',
    'notes superior a 5000 caracteres es rechazado'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, links) VALUES ('00000000-0000-0000-0000-000000000013', 'Cat', 'Name', 'Model', 'Cap', ('[' || repeat('1,', 10000) || '1]')::jsonb) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_links_size"',
    'links que supera el límite serializado es rechazado'
);

SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, issues) VALUES ('00000000-0000-0000-0000-000000000014', 'Cat', 'Name', 'Model', 'Cap', ('[' || repeat('1,', 50000) || '1]')::jsonb) $$,
    'new row for relation "catalog_custom_products" violates check constraint "chk_catalog_issues_size"',
    'issues que supera el límite serializado es rechazado'
);


-- 6. Update Modtime & Deleted A
SELECT has_trigger('public', 'catalog_custom_products', 'update_catalog_custom_products_modtime', 'Debe tener trigger update_catalog_custom_products_modtime');

INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity, updated_at)
VALUES ('00000000-0000-0000-0000-000000000099', 'Cat', 'Name', 'Model', 'Cap', '2000-01-01 00:00:00+00');

UPDATE public.catalog_custom_products SET notes = 'Updated notes' WHERE request_id = '00000000-0000-0000-0000-000000000099';

SELECT results_eq(
    $$ SELECT (updated_at = '2000-01-01 00:00:00+00'::timestamptz) FROM public.catalog_custom_products WHERE request_id = '00000000-0000-0000-0000-000000000099' $$,
    ARRAY[false],
    'updated_at ya no debe ser el timestamp antiguo después de UPDATE'
);

SELECT lives_ok(
    $$ UPDATE public.catalog_custom_products SET deleted_at = now() WHERE request_id = '00000000-0000-0000-0000-000000000001' $$,
    'deleted_at puede establecerse sin eliminar físicamente la fila'
);

SELECT results_eq(
    $$ SELECT count(*)::int FROM public.catalog_custom_products WHERE request_id = '00000000-0000-0000-0000-000000000001' $$,
    ARRAY[1],
    'filas borradas lógicamente permanecen en tabla para recuperación'
);

-- 7. Verificar prohibiciones directas para clientes interactivos
-- Switch back to superuser (postgres) before setting anon so we can safely switch contexts
SET ROLE postgres;

SET ROLE anon;
SELECT throws_ok(
    $$ SELECT * FROM public.catalog_custom_products $$,
    'permission denied for table catalog_custom_products',
    'anon no puede SELECT'
);
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES (gen_random_uuid(), 'C', 'N', 'M', 'C') $$,
    'permission denied for table catalog_custom_products',
    'anon no puede INSERT'
);
SELECT throws_ok(
    $$ UPDATE public.catalog_custom_products SET cat = 'New' $$,
    'permission denied for table catalog_custom_products',
    'anon no puede UPDATE'
);
SELECT throws_ok(
    $$ DELETE FROM public.catalog_custom_products $$,
    'permission denied for table catalog_custom_products',
    'anon no puede DELETE'
);

SET ROLE postgres;
SET ROLE authenticated;
SELECT throws_ok(
    $$ SELECT * FROM public.catalog_custom_products $$,
    'permission denied for table catalog_custom_products',
    'authenticated no puede SELECT'
);
SELECT throws_ok(
    $$ INSERT INTO public.catalog_custom_products (request_id, cat, name, model, capacity) VALUES (gen_random_uuid(), 'C', 'N', 'M', 'C') $$,
    'permission denied for table catalog_custom_products',
    'authenticated no puede INSERT'
);
SELECT throws_ok(
    $$ UPDATE public.catalog_custom_products SET cat = 'New' $$,
    'permission denied for table catalog_custom_products',
    'authenticated no puede UPDATE'
);
SELECT throws_ok(
    $$ DELETE FROM public.catalog_custom_products $$,
    'permission denied for table catalog_custom_products',
    'authenticated no puede DELETE'
);

SELECT * FROM finish();
ROLLBACK;
