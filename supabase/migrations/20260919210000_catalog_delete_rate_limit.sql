CREATE TABLE public.catalog_delete_rate_limit (
    ident_hash TEXT PRIMARY KEY CHECK (pg_catalog.length(ident_hash) > 0 AND pg_catalog.length(ident_hash) <= 256),
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    window_start TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

REVOKE ALL ON public.catalog_delete_rate_limit FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_catalog_delete_rate_limit(
    client_ident TEXT,
    max_attempts INT DEFAULT 5,
    window_interval INTERVAL DEFAULT '1 minute'::interval
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempts INT;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
    IF client_ident IS NULL OR pg_catalog.length(client_ident) = 0 THEN
        RAISE EXCEPTION 'client_ident invalido';
    END IF;
    IF max_attempts <= 0 THEN
        RAISE EXCEPTION 'max_attempts invalido';
    END IF;
    IF window_interval <= '0'::interval THEN
        RAISE EXCEPTION 'window_interval invalido';
    END IF;

    INSERT INTO public.catalog_delete_rate_limit (ident_hash, attempts, window_start)
    VALUES (client_ident, 1, v_now)
    ON CONFLICT (ident_hash) DO UPDATE
    SET
        attempts = CASE
            WHEN v_now - public.catalog_delete_rate_limit.window_start > window_interval THEN 1
            ELSE public.catalog_delete_rate_limit.attempts + 1
        END,
        window_start = CASE
            WHEN v_now - public.catalog_delete_rate_limit.window_start > window_interval THEN v_now
            ELSE public.catalog_delete_rate_limit.window_start
        END
    RETURNING attempts INTO v_attempts;

    RETURN v_attempts <= max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.check_catalog_delete_rate_limit(TEXT, INT, INTERVAL) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_catalog_delete_rate_limit(TEXT, INT, INTERVAL) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_catalog_delete_rate_limit(client_ident TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF client_ident IS NULL OR pg_catalog.length(client_ident) = 0 THEN
        RAISE EXCEPTION 'client_ident invalido';
    END IF;
    DELETE FROM public.catalog_delete_rate_limit WHERE ident_hash = client_ident;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_catalog_delete_rate_limit(TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_catalog_delete_rate_limit(TEXT) TO service_role;
