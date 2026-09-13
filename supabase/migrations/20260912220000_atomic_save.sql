-- Migration: Atomic save for daily_reports
-- Revoke direct INSERT/UPDATE from authenticated
REVOKE INSERT, UPDATE ON public.daily_reports FROM authenticated;

-- Function to set daily report atomically
CREATE OR REPLACE FUNCTION public.set_daily_report(
  p_work_date DATE,
  p_resolved_count INTEGER,
  p_expected_revision INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_profile_status TEXT;
  v_current_revision INTEGER;
  v_new_revision INTEGER;
  v_expected INTEGER;
  v_constraint TEXT;
BEGIN
  -- 1. Identify user via JWT
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Verify active profile
  SELECT status INTO v_profile_status FROM public.profiles WHERE user_id = v_uid;
  IF v_profile_status IS NULL OR v_profile_status <> 'active' THEN
    RAISE EXCEPTION 'Profile is not active';
  END IF;

  -- 3. Validate input
  IF p_resolved_count < 0 OR p_resolved_count > 9999 THEN
    RAISE EXCEPTION 'resolved_count must be between 0 and 9999';
  END IF;

  v_expected := COALESCE(p_expected_revision, 0);
  IF v_expected < 0 THEN
    RAISE EXCEPTION 'expected_revision cannot be negative';
  END IF;

  -- 4. Try to update existing row if revision matches
  UPDATE public.daily_reports
  SET resolved_count = p_resolved_count,
      revision = revision + 1
  WHERE user_id = v_uid AND work_date = p_work_date AND revision = v_expected
  RETURNING revision INTO v_new_revision;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'revision', v_new_revision);
  END IF;

  -- 5. If not found, it either doesn't exist, or revision mismatch
  SELECT revision INTO v_current_revision
  FROM public.daily_reports
  WHERE user_id = v_uid AND work_date = p_work_date;

  IF FOUND THEN
    -- Row exists, but the revision we expected didn't match the current one
    RETURN jsonb_build_object('success', false, 'conflict', true, 'current_revision', v_current_revision);
  ELSE
    -- Row doesn't exist. If expected_revision > 0, it's a conflict (client expected an existing row).
    IF v_expected > 0 THEN
      RETURN jsonb_build_object('success', false, 'conflict', true, 'current_revision', 0);
    END IF;

    -- Safe to attempt INSERT. Catch constraint violations for race conditions.
    BEGIN
      INSERT INTO public.daily_reports (user_id, work_date, resolved_count, revision)
      VALUES (v_uid, p_work_date, p_resolved_count, 1)
      RETURNING revision INTO v_new_revision;
      
      RETURN jsonb_build_object('success', true, 'revision', v_new_revision);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint != 'daily_reports_user_date_key' THEN
        RAISE; -- Some other constraint was violated
      END IF;

      -- A concurrent insert beat us to it. It's a conflict.
      SELECT revision INTO v_current_revision
      FROM public.daily_reports
      WHERE user_id = v_uid AND work_date = p_work_date;
      
      RETURN jsonb_build_object('success', false, 'conflict', true, 'current_revision', v_current_revision);
    END;
  END IF;
END;
$$;

-- Revoke default execute from PUBLIC and anon, only grant to authenticated
REVOKE ALL ON FUNCTION public.set_daily_report(DATE, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_daily_report(DATE, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_daily_report(DATE, INTEGER, INTEGER) TO authenticated;
