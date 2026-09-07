-- The population type vocabulary is POPULATION_TYPES in
-- lib/types/population.ts: the import, the formula resolver and the editor
-- read it there, so the table and the foreign key to it go. On a fresh
-- replay 080 re-creates the table and this drops it again.
ALTER TABLE population DROP CONSTRAINT IF EXISTS population_population_type_fkey;
DROP TABLE IF EXISTS population_types;
