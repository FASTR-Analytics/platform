# PLAN: Remove the old (pre-split) structure tables and config rows

Status: waiting — no deadline. Do this whenever we're confident we will never
roll back to a pre-076 image (a month after the 076 deploy is plenty).
Nothing in the app depends on this ever running; it is disk/clutter hygiene.

## Background

Migration 076 (PLAN_2_STRUCTURE_FAMILY_SPLIT, 2026-08-12) split the shared
admin-area trees and global structure config into per-family versions. The
legacy objects were deliberately left in place, fully detached — no reader,
no writer, FKs repointed away:

- Tables `admin_areas_1`, `admin_areas_2`, `admin_areas_3`, `admin_areas_4`
- `instance_config` rows `max_admin_area` and `facility_columns`

They exist ONLY so that rolling back to a pre-076 image leaves a working
read path (the old code reads those config rows on every request). Once a
rollback across 076 is off the table, they are dead weight.

## The change

Add a new SQL migration (next free number at the time — do NOT assume 077)
in `server/db/migrations/instance/`:

```sql
-- Drops the frozen legacy shared admin-area trees and the legacy global
-- config rows that migration 076 replaced with per-family
-- structure_schema_hmis / structure_schema_hfa rows. Detached since 076
-- (no reader, no writer); kept only as a rollback path.

DROP TABLE IF EXISTS admin_areas_4;
DROP TABLE IF EXISTS admin_areas_3;
DROP TABLE IF EXISTS admin_areas_2;
DROP TABLE IF EXISTS admin_areas_1;

DELETE FROM instance_config WHERE config_key IN ('max_admin_area', 'facility_columns');
```

No `_main_database.sql` change (fresh installs never had these objects), no
code change, no cache bump.

## Gates

- `./validate_migrations` (the migration no-ops on fresh installs — the
  tables and rows don't exist there)
