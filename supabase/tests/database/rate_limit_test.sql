begin;
select plan(8);

-- Check table grants
select table_privs_are('public', 'rate_limits', 'anon', ARRAY[]::text[], 'anon should have no privileges on rate_limits');
select table_privs_are('public', 'rate_limits', 'authenticated', ARRAY[]::text[], 'authenticated should have no privileges on rate_limits');
select table_privs_are('public', 'rate_limits', 'service_role', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'service_role should have all privileges');

-- Check function grants for check_rate_limit
select function_privs_are('public', 'check_rate_limit', ARRAY['text', 'integer', 'interval'], 'anon', ARRAY[]::text[], 'anon should not execute check_rate_limit');
select function_privs_are('public', 'check_rate_limit', ARRAY['text', 'integer', 'interval'], 'authenticated', ARRAY[]::text[], 'authenticated should not execute check_rate_limit');
select function_privs_are('public', 'check_rate_limit', ARRAY['text', 'integer', 'interval'], 'service_role', ARRAY['EXECUTE'], 'service_role should execute check_rate_limit');

-- Check function grants for reset_rate_limit
select function_privs_are('public', 'reset_rate_limit', ARRAY['text'], 'anon', ARRAY[]::text[], 'anon should not execute reset_rate_limit');
select function_privs_are('public', 'reset_rate_limit', ARRAY['text'], 'authenticated', ARRAY[]::text[], 'authenticated should not execute reset_rate_limit');

select * from finish();
rollback;
