-- Create the append-only table
CREATE TABLE public.report_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    client_entry_id UUID NOT NULL,
    work_date DATE NOT NULL,
    calls INTEGER NOT NULL CHECK (calls >= 0 AND calls <= 9999),
    emails INTEGER NOT NULL CHECK (emails >= 0 AND emails <= 9999),
    live_chats INTEGER NOT NULL CHECK (live_chats >= 0 AND live_chats <= 9999),
    total INTEGER GENERATED ALWAYS AS (calls + emails + live_chats) STORED CHECK (total > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_entry_id)
);

-- Indexes
CREATE INDEX idx_report_entries_user_date ON public.report_entries (user_id, work_date);
CREATE INDEX idx_report_entries_history ON public.report_entries (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.report_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Select to owner when active
CREATE POLICY "Usuarios pueden leer sus reportes de entrada"
    ON public.report_entries
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.user_id = auth.uid() AND profiles.status = 'active'
        )
    );

-- Block direct modifications
REVOKE ALL ON public.report_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.report_entries TO authenticated;

-- Idempotent append RPC
CREATE OR REPLACE FUNCTION public.append_report_entry(
    p_calls INTEGER,
    p_emails INTEGER,
    p_live_chats INTEGER,
    p_client_entry_id UUID
)
RETURNS public.report_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_active BOOLEAN;
    v_work_date DATE;
    v_result public.report_entries;
    v_existing public.report_entries;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_calls IS NULL THEN RAISE EXCEPTION 'p_calls no puede ser nulo'; END IF;
    IF p_emails IS NULL THEN RAISE EXCEPTION 'p_emails no puede ser nulo'; END IF;
    IF p_live_chats IS NULL THEN RAISE EXCEPTION 'p_live_chats no puede ser nulo'; END IF;
    IF p_client_entry_id IS NULL THEN RAISE EXCEPTION 'p_client_entry_id no puede ser nulo'; END IF;

    SELECT (status = 'active') INTO v_active FROM public.profiles WHERE user_id = v_user_id;
    IF NOT COALESCE(v_active, false) THEN
        RAISE EXCEPTION 'Profile is not active';
    END IF;

    IF p_calls < 0 OR p_calls > 9999 OR
       p_emails < 0 OR p_emails > 9999 OR
       p_live_chats < 0 OR p_live_chats > 9999 THEN
        RAISE EXCEPTION 'Valores fuera de rango permitido (0-9999)';
    END IF;

    IF (p_calls + p_emails + p_live_chats) <= 0 THEN
        RAISE EXCEPTION 'El total debe ser mayor que cero';
    END IF;

    v_work_date := (pg_catalog.now() AT TIME ZONE 'America/La_Paz')::DATE;

    INSERT INTO public.report_entries (user_id, client_entry_id, work_date, calls, emails, live_chats)
    VALUES (v_user_id, p_client_entry_id, v_work_date, p_calls, p_emails, p_live_chats)
    ON CONFLICT (user_id, client_entry_id) DO NOTHING
    RETURNING * INTO v_result;

    IF v_result IS NULL THEN
        -- Hubo conflicto. Recuperar registro existente.
        SELECT * INTO v_existing FROM public.report_entries WHERE user_id = v_user_id AND client_entry_id = p_client_entry_id;
        IF v_existing.calls = p_calls AND v_existing.emails = p_emails AND v_existing.live_chats = p_live_chats THEN
            RETURN v_existing;
        ELSE
            RAISE EXCEPTION 'Conflicto: El mismo UUID fue provisto con datos diferentes';
        END IF;
    END IF;

    RETURN v_result;
END;
$$;

-- Secure privileges
REVOKE ALL ON FUNCTION public.append_report_entry(INTEGER, INTEGER, INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_report_entry(INTEGER, INTEGER, INTEGER, UUID) TO authenticated;
