-- Migration: Initial Schema for WalkingWeb Backend
-- Date: 2026-09-12

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create daily_reports table
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (resolved_count BETWEEN 0 AND 9999),
  -- NOTA: `revision` se declara aquí pero aún no se incrementa de forma transaccional 
  -- en la base de datos (mediante trigger o regla). La protección concurrente real
  -- se implementará en la etapa de persistencia.
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_reports_user_date_key UNIQUE (user_id, work_date)
);

-- 3. Functions and Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_modtime
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE TRIGGER update_daily_reports_modtime
BEFORE UPDATE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- 4. Revoke default privileges and grant specific permissions
REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.daily_reports FROM anon, authenticated;

-- Grants for profiles
GRANT SELECT ON public.profiles TO authenticated;

-- Grants for daily_reports
GRANT SELECT, INSERT, UPDATE ON public.daily_reports TO authenticated;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for profiles
-- Users can read their own profile, even if disabled (para poder mostrar que su cuenta fue suspendida)
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Se eliminó la política de UPDATE para perfiles. Los usuarios no pueden cambiar su display_name o status.
-- Estas operaciones deben realizarse desde una operación de servidor o rol privilegiado.

-- 7. RLS Policies for daily_reports
-- Users can only read their own reports IF their profile is active
CREATE POLICY "Active users can read own daily reports"
  ON public.daily_reports
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND status = 'active')
  );

-- Users can insert their own reports IF their profile is active
CREATE POLICY "Active users can insert own daily reports"
  ON public.daily_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND status = 'active')
  );

-- Users can update their own reports IF their profile is active
CREATE POLICY "Active users can update own daily reports"
  ON public.daily_reports
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND status = 'active')
  )
  WITH CHECK (
    auth.uid() = user_id AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND status = 'active')
  );

-- Note: DELETE policy is intentionally omitted. Users cannot delete their reports.
