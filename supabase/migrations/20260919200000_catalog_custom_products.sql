-- Migration: catalog_custom_products
-- Purpose: Schema para productos personalizados compartidos, sin afectar los 42 modelos base.

CREATE TABLE public.catalog_custom_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  cat TEXT NOT NULL,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  capacity TEXT NOT NULL,
  speed TEXT NOT NULL DEFAULT '',
  motor TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  folded TEXT NOT NULL DEFAULT '',
  control TEXT NOT NULL DEFAULT '',
  assembly TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_catalog_cat_not_empty CHECK (btrim(cat) <> ''),
  CONSTRAINT chk_catalog_name_not_empty CHECK (btrim(name) <> ''),
  CONSTRAINT chk_catalog_model_not_empty CHECK (btrim(model) <> ''),
  CONSTRAINT chk_catalog_capacity_not_empty CHECK (btrim(capacity) <> ''),
  CONSTRAINT chk_catalog_revision_non_negative CHECK (revision >= 0),
  CONSTRAINT chk_catalog_links_is_array CHECK (jsonb_typeof(links) = 'array'),
  CONSTRAINT chk_catalog_issues_is_array CHECK (jsonb_typeof(issues) = 'array'),

  CONSTRAINT chk_catalog_cat_length CHECK (length(cat) <= 100),
  CONSTRAINT chk_catalog_name_length CHECK (length(name) <= 200),
  CONSTRAINT chk_catalog_model_length CHECK (length(model) <= 120),
  CONSTRAINT chk_catalog_capacity_length CHECK (length(capacity) <= 500),
  CONSTRAINT chk_catalog_speed_length CHECK (length(speed) <= 500),
  CONSTRAINT chk_catalog_motor_length CHECK (length(motor) <= 500),
  CONSTRAINT chk_catalog_area_length CHECK (length(area) <= 500),
  CONSTRAINT chk_catalog_weight_length CHECK (length(weight) <= 500),
  CONSTRAINT chk_catalog_folded_length CHECK (length(folded) <= 500),
  CONSTRAINT chk_catalog_control_length CHECK (length(control) <= 500),
  CONSTRAINT chk_catalog_assembly_length CHECK (length(assembly) <= 500),
  CONSTRAINT chk_catalog_notes_length CHECK (length(notes) <= 5000),

  -- Prevent unbounded JSON payloads usando octet_length para límite explícito en bytes serializados
  CONSTRAINT chk_catalog_links_size CHECK (octet_length(links::text) <= 10000),
  CONSTRAINT chk_catalog_issues_size CHECK (octet_length(issues::text) <= 50000)
);

CREATE TRIGGER update_catalog_custom_products_modtime
BEFORE UPDATE ON public.catalog_custom_products
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

CREATE INDEX idx_catalog_active_created_at ON public.catalog_custom_products (created_at) WHERE deleted_at IS NULL;

ALTER TABLE public.catalog_custom_products ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_custom_products FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.catalog_custom_products TO service_role;
