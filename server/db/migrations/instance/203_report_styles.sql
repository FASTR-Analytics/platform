-- Custom report styles: user-authored AI design briefs for HTML and FASTR
-- Markdown reports (SYSTEM_12). Instance-level, so the rows live in the MAIN
-- database beside the products they style.
--
-- reference_css carries the source report's actual <style> CSS verbatim. The
-- distilled prose brief alone proved lossy: an AI regenerating CSS from prose
-- never matches the original report's look, so the reference stylesheet is
-- injected into the authoring instructions to REUSE.
--
-- Visibility is per product: product_ids NULL = every product on the
-- instance, else a JSON array of product ids. Reports snapshot the brief into
-- their config at creation and resolve the live row while it remains visible
-- (live ref + snapshot fallback).
--
-- Numbered into the 200 series because the pre-restructure pair (075/076,
-- scoped to projects) collided with this branch's own 075/076. Instances that
-- already ran that pair keep their rows: the guarded block below retires the
-- dead project_ids column, since PLAN_PRODUCTS_RESTRUCTURE left no project
-- for it to name.

CREATE TABLE IF NOT EXISTS report_styles (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  brief text NOT NULL,
  reference_css text,
  colors text,
  product_ids text,
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_styles ADD COLUMN IF NOT EXISTS reference_css text;
ALTER TABLE report_styles ADD COLUMN IF NOT EXISTS product_ids text;
ALTER TABLE report_styles DROP COLUMN IF EXISTS project_ids;
