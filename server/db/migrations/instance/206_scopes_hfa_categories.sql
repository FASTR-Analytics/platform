-- A scope's HFA section gains two list dimensions, categories and service
-- categories (PLAN_SCOPES_HFA_CATEGORIES). Every included HFA section written
-- before them (migration 204's seeds, and scopes authored since) gets both as
-- null, which limits nothing and leaves the definition hash unchanged.

UPDATE scopes
SET definition = jsonb_set(
  jsonb_set(definition::jsonb, '{hfa,categories}', 'null'::jsonb),
  '{hfa,serviceCategories}', 'null'::jsonb
)::text
WHERE definition::jsonb #>> '{hfa,include}' = 'true'
  AND definition::jsonb #> '{hfa,categories}' IS NULL;
