# Legacy & Migration Handling

A catalogue of every mechanism in this codebase that adapts old data or old shapes to current code. Keep this doc up-to-date when adding new migrations, adapters, or legacy shims — it's the single source of truth for "what old state do we still support, and where does it live?".

## The five patterns

Each pattern has a specific shape of problem it solves. Pick the pattern that matches the problem; don't invent new ones.

| # | Pattern                              | Use when                                                   | Cleanup                                                                    |
|---|--------------------------------------|------------------------------------------------------------|----------------------------------------------------------------------------|
| 1 | Centralized read-time adapter        | JSON blob shape changed, TS/text column                    | Track per-transform removal in the adapter file                            |
| 2 | Inline read-time auto-migrate        | Single narrow field rename/rewrite, hot path               | Fold into a Pattern 1 adapter when it grows                                |
| 3 | Dual-check "legacy adapter" comments | Bool/enum deprecated, read from many sites                 | Remove comment-marked lines once confident all configs re-saved            |
| 4 | One-off JS startup migration         | Cross-table structural change, PostgreSQL jsonb-unfriendly | Keep forever (idempotent); delete once no deployments remain with old data |
| 5 | SQL schema migration                 | Column/table shape changes                                 | Keep forever                                                               |

**Not a pattern: deliberate non-adaptation.** Sometimes the right choice is to do nothing, because a missing field already has a correct meaning in the domain. See ["When NOT to adapt"](#when-not-to-adapt) below.

---

## Pattern 1 — Centralized read-time adapter

Single function applied at every read path for a given entity. Reads raw JSON, normalizes to the current TS type, returns.

**Canonical example:** [server/db/project/legacy_report_adapter.ts](server/db/project/legacy_report_adapter.ts) — `adaptLegacyReportItemConfig`. Called from [reports.ts:355,600](server/db/project/reports.ts#L355). Currently handles:

- Layout 2D array → `LayoutNode` tree
- `moduleId` → `metricId` lookup via `presentation_objects`
- `placeholder` item type → `text` item type

**When to use:** The entity's JSON blob has accumulated multiple legacy shapes, OR you expect more to come.

**Wiring rule:** every DB read path must go through the adapter. If you add a new read site and forget the adapter, you'll see `undefined` on normalized fields. Audit via grep for the entity's `parseJsonOrThrow` calls.

**Write side:** writes always produce the new shape (types enforce it). Old rows self-heal when re-saved. No eager migration needed.

**Active adapters:**

- `legacy_report_adapter.ts` — report item configs.

- `legacy_po_config_adapter.ts` — exports two adapters for two separate JSON columns:
  - `adaptLegacyPresentationObjectConfig` → wired into every read of `presentation_objects.config`.
  - `adaptLegacyVizPresets` → wired into the read of `metrics.viz_presets` (installed-at-time snapshot of module presets). Ensures already-installed modules don't silently regress when accessed by preset pickers, preset preview, or AI slide builder.

  Current transforms: `d.periodOpt` → `d.timeseriesGrouping` rename; strip fabricated bounds from relative periodFilters; drop legacy `defaultPeriodFilterForDefaultVisualizations` from vizPresets.

---

## Pattern 2 — Inline read-time auto-migrate

A single in-place rewrite done inside a read or resolve function. Smaller than Pattern 1; usually one transform.

**Active sites:**

- [lib/get_fetch_config_from_po.ts:88-95](lib/get_fetch_config_from_po.ts#L88) — rewrites `filterType: "last_12_months"` to `filterType: "last_n_months"` with `nMonths: 12`.
- [client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:26-44](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L26) — `resolvePeriodFilter` realigns a stored `periodFilter.periodOption` when it doesn't match the data's actual time column.

**When to use:** simplest possible narrow rewrite, inside a hot read path that already exists.

**Graduation rule:** when a second legacy transform for the same entity appears, consolidate into Pattern 1. Scattered Pattern-2 shims become hard to audit.

---

## Pattern 3 — Dual-check "legacy adapter" comments

At every read site, check both the old field AND the new field as equivalent. Written-out condition: `newFlag || (oldConditions...)`. Every such line is marked with the exact comment `// Legacy adapter — remove once all configs migrated` so grep finds them together.

**Active sites — `diffAreas` → `specialDisruptionsChart`:**

- [client/src/generate_visualization/get_style_from_po.ts:21](client/src/generate_visualization/get_style_from_po.ts#L21)
- [client/src/generate_visualization/conditional_formatting.ts:211](client/src/generate_visualization/conditional_formatting.ts#L211)
- [client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx:106](client/src/components/visualization/presentation_object_editor_panel_style/_shared.tsx#L106)
- [client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx:41,51](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L41)

**When to use:** a boolean/enum flag is deprecated in favor of a new flag, and the old flag is read from many code paths. Cheap per-site check is easier than a centralized adapter when the old shape is just one extra field.

**Cleanup rule:** grep for `Legacy adapter — remove once all configs migrated`. When you're confident every config has been re-saved (or a Pattern 4 migration was run to force it), delete those lines and any support types.

**Prefer Pattern 1 for new work.** Pattern 3 scatters knowledge. Existing sites can stay, but for new renames/replacements, route reads through an adapter.

---

## Pattern 4 — One-off JS startup migration

Runs once at app startup. Tracked in the `schema_migrations` table via a `MIGRATION_ID`. Idempotent check at the top.

**Canonical example:** [server/db_startup.ts:116 `migrateToMetricsTables`](server/db_startup.ts#L116). MIGRATION_ID: `js_migrate_to_metrics_2025_02`. Populates the `metrics` table from module definitions and links existing `presentation_objects` to metric rows.

**Shape:**

```ts
async function migrateXxx(sql) {
  const MIGRATION_ID = "js_migrate_xxx_YYYY_MM";
  const applied = await sql`SELECT ... FROM schema_migrations WHERE migration_id = ${MIGRATION_ID}`;
  if (applied.length > 0) return;

  await sql.begin(async (tx) => {
    // ... do the migration ...
    await tx`INSERT INTO schema_migrations (migration_id) VALUES (${MIGRATION_ID})`;
  });
}
```

**When to use:** a cross-table or cross-entity structural change that's awkward in SQL — especially when JSON blob surgery is required (our config columns are `text`, not `jsonb`, so `jsonb_set` isn't practical).

**Lifetime:** these stay in the startup code forever. They're idempotent — harmless on already-migrated DBs. Only delete once you're certain no deployment of the app will ever encounter a pre-migration database.

---

## Pattern 5 — SQL schema migration

Versioned `.sql` files, auto-run at startup. For column additions, table creations, index changes, constraint adjustments.

**Locations:**

- [server/db/migrations/instance/](server/db/migrations/instance/) — runs against the main database.
- [server/db/migrations/project/](server/db/migrations/project/) — runs against each project database.

**Naming:** `NNN_description.sql`, zero-padded. Numbers must be unique within each directory.

### ⚠️ Rules — read these before writing a migration

1. **Every migration script must be idempotent.** Use `IF NOT EXISTS`, `IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`. A migration that runs twice (due to a partial startup, rollback, or replay) must produce the same end state as running it once. No `CREATE TABLE` without `IF NOT EXISTS`. No `INSERT` without `ON CONFLICT DO NOTHING` / `ON CONFLICT DO UPDATE`.

2. **Every migration must also update the live schema files.** These are the two source-of-truth files used when creating fresh databases:
   - [server/db/instance/_main_database.sql](server/db/instance/_main_database.sql)
   - [server/db/project/_project_database.sql](server/db/project/_project_database.sql)

   If you add a column via migration, add it to the `CREATE TABLE` in the corresponding schema file too. Otherwise a fresh DB create → migration run will drift from the intended shape (or the migration will re-do work already done).

3. **Don't rewrite old migrations.** Once a migration lands in main, it's history. Fix forward with a new migration. Rewriting breaks DBs that already ran the old version.

**Canonical minimal example** ([008_slide_deck_config.sql](server/db/migrations/project/008_slide_deck_config.sql)):

```sql
-- Migration 008: Add config column to slide_decks
ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS config text;
```

Paired with an update to `_project_database.sql` so fresh DBs get the column directly.

**When to use:** structural changes — new columns, new tables, new indexes, type changes, constraint additions. Do NOT use for data transforms on JSON `text` columns (use Pattern 4).

---

## When NOT to adapt

Sometimes the right move is to adapt nothing. If a field is missing from old rows and the missing state already has a correct meaning in the domain, a migration or adapter is busywork.

**Active sites:**

- HFA project info ([PLAN_hfa_02_staleness_detection.md:55](PLAN_hfa_02_staleness_detection.md#L55)): `info = '{}'` → all snapshot fields `undefined` → treated as "stale", forcing re-export. Intentional design. No migration, no adapter.

**Test:** could you "fix" this by running a Pattern 1 adapter or Pattern 4 migration? Almost always yes. The question isn't whether it's *possible* — it's whether the missing state is already semantically correct. If it is, don't adapt.

**When you still need to adapt instead:** the field is required for correctness (not a derived flag), or the missing state would crash/render wrong, or downstream code branches on field presence in a way the domain semantics don't support. Use Pattern 1 or Pattern 4.

---

## Also worth knowing — user-initiated migrations

Not strictly "legacy handling" but the same family: explicit UI flows where the user triggers a one-shot data transform on their own project.

- [client/src/components/project/migrate_reports_to_slides.tsx](client/src/components/project/migrate_reports_to_slides.tsx) — user clicks "Migrate", old reports are read, new slide decks are created in an "Old reports" folder.

**When to use:** a migration that depends on user intent, irreversible data reshaping, or where surfacing the change to the user is itself important.

---

## How to add a new legacy-handling entry

Before writing code, decide:

1. **What's the source of the old shape?** Stored JSON blob? Column type? Missing-and-meaningful?
2. **What transforms are needed?** One rewrite? Multiple? Cross-table?
3. **Is the new shape type-enforced on write?** If yes, old data self-heals on re-save; read-time adapter is sufficient. If no, you need a write-side migration too.

Then pick the pattern:

- JSON blob, 1 transform, simple → Pattern 2 (inline). Promote to Pattern 1 when a second transform arrives.
- JSON blob, 2+ transforms → Pattern 1 (centralized adapter). Create one if the entity doesn't have one yet.
- Flag/enum rename, read from many sites → Pattern 3 (dual-check with comment marker). Prefer Pattern 1 if starting fresh.
- Cross-table or structural data move → Pattern 4 (JS startup migration with MIGRATION_ID). Always idempotent.
- Column/table shape → Pattern 5 (SQL migration). Update both schema files. Idempotent guards required.
- Missing = domain-meaningful → don't adapt. See ["When NOT to adapt"](#when-not-to-adapt) and document the intent.

Finally: **add an entry to this doc.** Future-you will thank you when it's time to clean up.

---

## Cleanup audit — current debt

For future tidying sessions, sites that should eventually be removed:

| Site                                                                            | Trigger for removal                                                                                          |
|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `diffAreas` legacy adapter (5 sites, Pattern 3)                                 | Once all deployments re-save affected configs, or a Pattern 4 migration forces it                            |
| `last_12_months` → `last_n_months` (Pattern 2 in `get_fetch_config_from_po.ts`) | Same                                                                                                         |
| `resolvePeriodFilter` periodOption realignment (Pattern 2 in `_2_filters.tsx`)  | Once the upcoming period-filter refactor lands and old configs are adapted through the new PO config adapter |
| `migrateToMetricsTables` (Pattern 4)                                            | Only when no deployment will see a pre-Feb-2025 database                                                     |
| `// Keep for backward compatibility` in panther types                           | Panther is an external library — not our maintenance concern                                                 |
