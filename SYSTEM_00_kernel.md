---
system: "00"
name: Kernel (read but don't own)
globs:
  - lib/consts.ts
  - lib/mod.ts
  - lib/types/instance.ts
  - lib/types/mod.ts
  - lib/utils.ts
  - server/exposed_env_vars.ts
docs_absorbed:
---

# S00 — Kernel (read but don't own)

Files every system depends on and none owns — the lib mega-barrel, the
multi-domain grab-bags, and the env nexus. S00 exists so these six have a
custodian in the lint without pretending they form a subsystem: there is no
kernel behavior to document, only shared surface. **Review them only alongside
the consuming system; any change needs a cross-system check** (SYSTEMS.md §4.2).
Written fresh from code 2026-07-17 (first review cycle, review-only — no DOC_*
absorbed).

## The six files

**`lib/mod.ts`** — the barrel behind the bare `"lib"` specifier, which both
tiers resolve to this file (`deno.json` `imports` for the server;
`client/tsconfig.json` `paths` via the `vite-tsconfig-paths` plugin for the
client — note `"lib"` is NOT in `vite.config.ts`'s manual alias list). ~479
files import it (120 server, 359 client). 24 `export *` lines re-exporting the
whole `lib/` surface, including `types/mod.ts` and `api-routes/mod.ts`. Because
everything the barrel reaches is compiled into **both** tiers, anything imported
here from panther must exist in both panther barrels (`mod.deno.ts` and
`mod.ui.ts`) — the `_000_utils` level only (CLAUDE.md "Importing panther").

**`lib/types/mod.ts`** — the types barrel: ~48 re-exported modules. Almost every
module it re-exports has a single owning system (the manifests claim them
individually); the barrel itself is just wiring. One deliberate exception:
`_module_definition_github.ts` re-exports named symbols only, not `export *`.

**`lib/types/instance.ts`** — the one genuinely multi-domain types file. It
holds, side by side: the `APIResponse` envelope types +
`throwIfErrWithData`/`throwIfErrNoData` asserts (S1's contract, defined here);
`InstanceMeta`/`InstanceDetail` and the instance-config zod schemas —
`maxAdminArea`, `countryIso3`, admin-area labels, facility columns with
`getEnabledOptionalFacilityColumns` + `hashFacilityColumnsConfig` (S5's config
surface); `GlobalUser`/`ProjectUser`/`OtherUser`/user-log types + the dev-mode
user factories (S1/S15); generic table-column and CSV-import wizard types
(`CsvDetails`, `Mappings`, `Conflicts` — S5/S6); and the `ItemsHolder*` payload
types, including `ItemsHolderPresentationObject` whose fields are cache-version
ingredients (S9 — the `datasetsVersion` doc-comment there is load-bearing).

**`lib/consts.ts`** — the constants grab-bag: `COUNTRY_ISO3_TO_LABEL` +
`getCountryLabel` (all tiers); `DEFAULT_ANTHROPIC_MODEL` (S13);
`MAX_CONTENT_BLOCKS` + slide word-count targets (S13 AI layout);
`FIGURE_EXPORT_WIDTH_PX`, `PAGE_ASPECT`/`PAGE_WIDTH_DU`/`PAGE_HEIGHT_DU` — the
single source of slide/page geometry every render and export surface reads
(S10/S12); the `TEXT_SIZE_KEYS`/`TEXT_SIZE_REL` semantic text-size scale (S12 —
stored keys are stable, retune by editing the numbers, no migration);
`_DATASET_LIMIT` (server-only, two route files).

**`lib/utils.ts`** — four functions: `withReplicant` (REPLICANT/RÉPLICANT title
substitution — S9/S10 display), `encodeRawCsvHeader` (S6),
`parseJsonOrUndefined`/`parseJsonOrThrow` (everywhere).

**`server/exposed_env_vars.ts`** — the env nexus: every environment variable is
read once here into a `_`-prefixed export, and nothing else may call
`Deno.env.get` (the ban is PLAN_DOC_ENFORCEMENT item 11). Exactly 42 server
files import it. Required vars fail fast at import time with a named error;
optional ones default. The domains it carries: instance identity/language/
calendar, sandbox + assets paths (S8/S4), Postgres coords (S2), Anthropic +
token limits (S13), SendGrid/status/central-server secrets (S15), DHIS2 tuning +
credentials-encryption key (S6/S7), auth flags (S1), deploy metadata, module
file-name constants and the four staging-table names (S6/S8). Two import-time
**side effects**: `setLanguage(_INSTANCE_LANGUAGE)` (panther's module-level
language state) and `setCalendar(_INSTANCE_CALENDAR)` (lib's calendar state in
`lib/translate/t-func.ts`) — importing any constant from this file silently
configures translation and calendar for the process.

## Contract

Nothing may be added here that has a single owning system — new constants/ types
belong in that system's files; the kernel only accumulates what is genuinely
cross-system. `Deno.env.get` outside `exposed_env_vars.ts` is banned
(enforcement item 11). Panther reaches the app only through the two barrels via
the `@timroberton/panther` / `"panther"` specifiers — never deep paths. Anything
`lib/mod.ts` re-exports must stay both-tier-safe.

## Open items

- **Decoupling — split `server/exposed_env_vars.ts`.** A 42-importer nexus
  carrying five systems' constants plus import-time `setLanguage`/`setCalendar`
  side effects. Per-domain constant modules + an explicit init call, so
  importing a staging-table name doesn't silently configure the calendar.
- **Presence-based boolean env vars.** `_IS_PRODUCTION`, `_OPEN_ACCESS`, and
  `_BYPASS_AUTH` use `!!Deno.env.get(...)` — any non-empty value is true, so
  `OPEN_ACCESS=false` in an env file ENABLES open access. Parse the value
  (`=== "true"`) or fail on unexpected values.
- **Decoupling — two deep panther imports bypass the `mod.ui.ts` barrel.**
  `slide_deck/slide_list.tsx` and `dashboards/dashboard_item_grid.tsx` both
  reach into
  `panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx`. Route
  them through the barrel.
- **Dead code (zero importers):** `_IMAGE_DIMENSIONS` in `lib/consts.ts`.
- **Cruft in `lib/types/instance.ts`:** `ProjectUser.role` is marked "delete
  after implementing new system" — the permission flags shipped but the legacy
  field still has ~6 live consumers (`projects.ts`, `users.ts`,
  `add_project.tsx`, …), so deletion needs a consumer migration first; also the
  commented-out `ItemsHolderDatasetAA2sAndIndicators` block.
