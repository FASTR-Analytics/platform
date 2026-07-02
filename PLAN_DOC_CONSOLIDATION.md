# Plan — Consolidate DOC_* into a SYSTEM_* file set

> **Status: PHASE 1 DONE** (2026-06-12). Scaffold landed: `lint_systems.ts`
> (green — all 666 tracked files claimed by exactly one of 16 systems, 0
> double-claims), the 15 `SYSTEM_NN_*.md` stubs + `SYSTEM_00_kernel.md` with
> glob-manifest frontmatter, `SYSTEMS.md` (index + custody table + audits +
> execution model), and the two `CROSS_*` stubs. The manifest was built by 11
> file-reading agents over the split directories + whole-dir globs, then
> adversarially verified by a 16-agent pass (10 misassignments found and fixed,
> 9 of 10 accepted). Remaining Phase 1 step deferred: pointing CLAUDE.md's
> per-area prose at SYSTEMS.md (do once SYSTEM files hold real prose, so readers
> aren't sent to stubs). **Phase 2** (prose port) rides each system's review
> cycle. Original plan below.
>
> ---
>
> Builds on the locked map, now canonical in [SYSTEMS.md](SYSTEMS.md) (the
> spent PLAN_SYSTEMS was deleted once its durable content landed there). Goal:
> retire the 29 scattered `DOC_*.md` files in favour of one `SYSTEM_NN_*.md` per
> system, so the canonical topology and its documentation are the same artifact,
> and a delegated "review system X" task opens exactly one file. Independent of
> the in-flight hardening work — can run in parallel.

---

## 1. End state

```
SYSTEMS.md                     # index: the map, per-system scope/contract,
                               #   §4.1 custody table, §4.2 kernel rule, §4.3
                               #   cross-cutting audits, §5 execution model.
                               #   (Absorbed the durable parts of the now-deleted
                               #   PLAN_SYSTEMS.md.)
SYSTEM_01_api_contract.md      # one per system; frontmatter = the manifest
SYSTEM_02_persistence.md
...                            #   (15 files, S1..S15)
SYSTEM_15_admin_ops.md
CROSS_*.md                     # a SMALL set for genuinely cross-system content
                               #   (see §4) — UI conventions, client-state tiers
lint_systems.ts               # repo-root script: every tracked file matches
                               #   exactly one system's globs; flags orphans +
                               #   double-claims
```

Unchanged: `panther/protocols/PROTOCOL_*` (cross-project base, synced from
panther — out of scope). `PLAN_*.md` files stay as the work backlog; finished
ones get deleted as today. `CLAUDE.md` keeps its top-level overview but its
per-area prose gets replaced by a pointer to `SYSTEMS.md`.

New category — `PROTOCOL_APP_*.md` at repo root: app-specific authoring recipes
(see §1b). `DOC_MIGRATIONS.md` becomes `PROTOCOL_APP_MIGRATIONS.md`; the route /
worker / AI-tool / help-button recipes split out of their hybrid DOC_* files.

---

## 1b. Document taxonomy (the model this consolidation follows)

Two axes — *construction (HOW)* vs *architecture (WHAT)*, and *cross-project* vs
*app-specific* — plus a transient change layer. Every doc has one home:

| | **HOW** (how to build) | **WHAT** (what it is / promises) |
|---|---|---|
| **cross-project** | `panther/protocols/PROTOCOL_*` (synced, don't edit) | panther's own (not this repo) |
| **app-specific** | **`PROTOCOL_APP_*`** (authoring recipes) | **`SYSTEM_NN_*`** (architecture + the lint-enforced file boundary) |

`PLAN_*` is the transient "what's changing" layer: a PLAN mutates a SYSTEM (and
sometimes a PROTOCOL_APP) and is deleted when it lands. `CLAUDE.md` is the index
pointing at all of it. `CROSS_*` and the §4.3 audit list are the app-specific
*horizontal* WHAT — still SYSTEM-layer, just not one vertical system.

**Why the HOW×app-specific cell matters:** `DOC_MIGRATIONS.md` is consulted
*mid-build* (how to author a migration: SQL + data_transform + skip-gate +
validate-at-boundary), not read to understand architecture. It is a recipe, not
a system description — and it is app-specific, so it can't live in
`panther/protocols/`. Folding it into `SYSTEM_02` would bury the citable
"reference X when building a migration" affordance. So it becomes a standalone
`PROTOCOL_APP_MIGRATIONS.md`.

**Each type has its own freshness mechanism — that is the operational payoff,
and why DOC_* rotted (SYSTEM-grade content with no refresh trigger):**

- `PROTOCOL_*` (cross-project): kept fresh by the panther sync (one source).
- `PROTOCOL_APP_*`: refreshed when the recipe it describes changes (a PLAN that
  alters migration mechanics updates it in lockstep).
- `SYSTEM_NN_*`: the **boundary** half is continuously lint-checked
  (`lint_systems.ts`); the **prose** half is re-verified against code in each
  review cycle. Describe *verified current* behaviour + the contract — the gap
  between "is" and "should be" lives in `PLAN_*` / the SYSTEM's open-items, never
  as aspirational prose (that is exactly how DOC_* drifted).
- `PLAN_*`: self-deleting when done.

**The port is a 3-way sort, not 2-way.** When porting a hybrid `DOC_*`:

1. architecture / behaviour / contract → its `SYSTEM_NN`
2. app-specific authoring recipe → a `PROTOCOL_APP_*` (new or existing)
3. a generic construction rule → **defer to the panther `PROTOCOL_*`; do NOT
   restate it** (the protocols' own README: rules live there, not duplicated).
   This *thins* the DOC_* content rather than relocating it wholesale — notably
   `DOC_STATE_*` vs `PROTOCOL_UI_STATE` and `DOC_DESIGN_SYSTEM`/`DOC_BUILD_INSTRUCTIONS`
   vs `PROTOCOL_UI_STYLING`/`_STRUCTURE`/`_COMPONENTS`, where the generic tier /
   styling rules already live in panther.

`PROTOCOL_APP_*` naming parallels panther's `PROTOCOL_<ALL|UI|DENO>_*` with an
"APP" scope token; living at repo root (not `panther/protocols/`) means `./sync`
never collides with it.

---

## 2. Two phases (don't big-bang the prose)

Porting 29 docs — several stale (see **Doc staleness to fix during the port**,
§3a) — in one shot is risky and wastes the verification. Split it:

**Phase 1 — scaffold (do now, ~half a day).** Map-independent of hardening.

1. Create `SYSTEM_NN_*.md` (×15) as stubs: each has the **frontmatter manifest**
   (§5), points at the system's **scope/contract/size** in `SYSTEMS.md` (System
   details), and a `docs_absorbed:` list that *links* (does not yet inline) the
   DOC_* files mapped to it (§3 table). No prose porting yet.
2. Create `SYSTEMS.md` (the map + System details + §4 + §5).
3. Write `lint_systems.ts` (§6) and get it green (every file claimed once).
4. Decide the `CROSS_*` set (§4).

Outcome: the manifest + lint land immediately; the topology is enforceable
against the tree from day one. DOC_* files still exist, now linked from their
owning SYSTEM file.

**Phase 2 — prose port (incremental, inside each system's review cycle).**

When a system's review cycle runs (SYSTEMS.md §5), porting its DOC_* prose
into the SYSTEM file IS part of the review — you're verifying the doc against
code anyway, so staleness gets fixed in the same motion. On completing a
system's port: inline the content, fix the §7.3 staleness items for that
system, then `git rm` (or move to `_archive_docs/`) the absorbed DOC_* files.

This means the DOC_* set shrinks system-by-system as cycles complete, rather
than a single fragile 29-file migration.

---

## 3. DOC_* → target mapping (3-way sort)

From the doc-audit, applying the §1b sort. "Architecture → " is the SYSTEM /
CROSS file that inlines the *what*; "Recipe → " is the `PROTOCOL_APP_*` that
takes the *how-to-build* slice (where the DOC is a hybrid); "Defer" flags a
generic-rule slice that goes to a panther `PROTOCOL_*` rather than being
restated. Pure-architecture docs have no Recipe column entry.

| DOC_* | Architecture → | Recipe → (PROTOCOL_APP) | Defer to panther |
|---|---|---|---|
| DOC_MIGRATIONS | S2 (thin pointer) | **PROTOCOL_APP_MIGRATIONS** ✅ minted 2026-06-12 | — |
| DOC_API_ROUTES | S1 | PROTOCOL_APP_ROUTES (add-a-route recipe) | — |
| DOC_ACCESS_CONTROL | S1 | — (also informs S15) | — |
| DOC_DB_ACCESS_LAYER | S2 | (SQL-safety rule may join PROTOCOL_APP_MIGRATIONS or a DB protocol) | — |
| DOC_SSE_REALTIME | S3 (also §4.3.1 audit) | — | — |
| DOC_VALKEY_CACHE | S3 (informs S9) | — | — |
| DOC_STATE_RULES + 3× DOC_STATE_MGT_* | CROSS_CLIENT_STATE (app field inventory) | — | **PROTOCOL_UI_STATE** (the T1–T5 rules) |
| DOC_TASK_EXECUTION_DIRTY_STATE | S8 | — | — |
| DOC_WORKER_ROUTINES | S8 (informs S6) | PROTOCOL_APP_WORKER_ROUTINES (write-a-worker recipe) | — |
| DOC_MODULE_EXECUTION | S8 | — | — |
| DOC_MODULE_UPDATES | S8 | — | — |
| DOC_POPULATION_CSV | S8 (informs S5) | — | — |
| DOC_IMPORT_PIPELINE | S6 ✅ ported + deleted 2026-07-02 (structure sections flagged for S5's cycle) | — | — |
| DOC_DHIS2_INTEGRATION | S7 | — | — |
| DOC_AI_PROXY_AND_USAGE_GOVERNANCE | S13 | — | — |
| DOC_AI_TOOL_SCHEMAS | S13 | PROTOCOL_APP_AI_TOOLS (author-a-tool-schema recipe) | — |
| DOC_PRESENTATION_OBJECT_QUERY_PIPELINE | S9 | — | — |
| DOC_period_column_handling | S9 (also §4.3.5 audit) | — | — |
| DOC_DISAGGREGATION_OPTIONS_HANDLING | S9 (informs S5) | — | — |
| DOC_ROLLUP_ROWS | S9 | — | — |
| DOC_SPECIAL_CHART_MODES | S10 | — | — |
| DOC_DESIGN_SYSTEM | CROSS_UI_CONVENTIONS (app tokens/patterns) | — | **PROTOCOL_UI_STYLING / _COMPONENTS** |
| DOC_BUILD_INSTRUCTIONS | CROSS_UI_CONVENTIONS | — | **PROTOCOL_UI_STRUCTURE** |
| DOC_TRANSLATION | S14 (also §4.3.6 audit) | — | **PROTOCOL_ALL_TRANSLATION** |
| DOC_HELP_BUTTONS | S14 | PROTOCOL_APP_HELP_BUTTONS (add-a-help-button recipe) | — |
| DOC_ACCESS_DBS | S15 (informs S2) | — | — |

Undocumented systems (no DOC_* to absorb — their SYSTEM file is written fresh
from code in Phase 2): **S4** (Assets & Upload), **S12** (Documents & Sharing —
the largest doc gap). S5 and S11 are only partially covered.

## 3a. Doc staleness to fix during the port

Known-stale items found in the systems review (carried over from the deleted
PLAN_SYSTEMS §7.3). Most dissolve when the owning DOC_* is consulted and inlined
during its system's Phase-2 cycle — listed here so the port catches them.

- **CLAUDE.md:** `server/ai/` and `server/visualization_definitions/` don't exist
  (AI proxy lives in `routes/project/ai_*.ts`; viz query code is
  `server_only_funcs_presentation_objects/`); `client/src/export_report` is now
  `client/src/exports/`; dataset-import progress is POLLED, not SSE; "i18n built
  from XLSX" is wrong per DOC_TRANSLATION; `state/ui.ts` and
  `components/project_runner/provider.tsx` are phantoms (real: `state/t4_ui.ts`,
  `components/project/index.tsx` area).
- ~~**DOC_IMPORT_PIPELINE:** pre-facilities-split; no ICEH; no wizard shell.~~ Resolved 2026-07-02: SYSTEM_06 written fresh from a verified review; doc deleted.
- **DOC_MIGRATIONS:** lists 5 of 10 transforms; "reports are deprecated" is
  wrong; links nonexistent DOC_AI_TOOL_VALIDATION.md; cites
  `lib/types/instance_config.ts` (real home: `lib/types/instance.ts`).
- **DOC_VALKEY_CACHE:** prefix `po_detail` → code is `po_detail_v2`.
- **DOC_API_ROUTES:** raw-route exception list cites the deleted share.ts routes.
- Minor: DOC_STATE_MGT_PROJECT cites `notify_project_updated.ts` (real:
  `notify_project_v2.ts`); DOC_BUILD_INSTRUCTIONS/DOC_DESIGN_SYSTEM cite
  `panther/FRONTEND_STYLE_GUIDE.md` (real: `client/src/FRONTEND_STYLE_GUIDE.md`);
  DOC_MODULE_UPDATES uses spec-style `:projectId` paths; DOC_ACCESS_DBS cites a
  deleted diagnostic script.

---

## 4. The CROSS_* set (genuine judgment call — decide in Phase 1)

Most DOC_* map cleanly to one system. Two clusters genuinely don't, because
they're conventions *every* client system follows:

- **CROSS_UI_CONVENTIONS.md** ← DOC_DESIGN_SYSTEM + DOC_BUILD_INSTRUCTIONS.
  Page patterns A–E, theme tokens (`app.css`), `FRONTEND_STYLE_GUIDE.md`.
  Consumed by S10/S11/S12/S14. *Alternative:* fold into S14 (the shell owns the
  design system) and have feature systems link it. **Recommend a CROSS doc** —
  it's referenced too widely to live inside one feature system.
- **CROSS_CLIENT_STATE.md** ← DOC_STATE_RULES + the 3 DOC_STATE_MGT_*. The
  T1–T5 tier model and read-mode rules (live / snapshot / edit-draft) that every
  client feature obeys. The *machinery* (stores, `_infra`, SSE bridges) is S3;
  the *rules* are cross-cutting. *Alternative:* fold the rules into S3 and the
  per-feature application into each SYSTEM file. **Recommend a CROSS doc** —
  it's the client-side counterpart to the §4.3 audits.

The §4.3 cross-cutting *audits* (notify/stamp, calendar, guard sweep, etc.)
live as a section in `SYSTEMS.md`, not as separate files — they're task
descriptions, not mechanism docs. Keep that list there.

Open decision for Tim: CROSS docs as proposed (2 files), or fold both into
S14/S3 and accept wider cross-links. Recommend the 2 CROSS files.

---

## 5. Frontmatter manifest (per SYSTEM file)

```yaml
---
system: 9
name: Visualization Query & Cache Service
globs:
  - lib/get_fetch_config_from_po.ts
  - lib/validate_fetch_config.ts
  - lib/admin_area_rollup.ts
  - server/server_only_funcs_presentation_objects/**
  - server/routes/caches/visualizations.ts
  - server/routes/caches/dataset.ts
  - server/routes/project/cache_status.ts
  - server/db/project/metric_enricher.ts
  - server/db/project/results_value_resolver.ts
  # routes/project/presentation_objects.ts + t2_presentation_objects.ts are
  # custody files (owned here, read by S11/S3/S10) — see SYSTEMS.md §4.1
  - server/routes/project/presentation_objects.ts
  - client/src/state/project/t2_presentation_objects.ts
  - client/src/state/project/t2_replicant_options.ts
docs_absorbed:
  - DOC_PRESENTATION_OBJECT_QUERY_PIPELINE
  - DOC_period_column_handling
  - DOC_DISAGGREGATION_OPTIONS_HANDLING
  - DOC_ROLLUP_ROWS
---
```

Rules:
- **Each tracked file matches exactly one system's globs** — the OWNER. Custody
  *readers* (§4.1) are NOT encoded as globs (a custody file lands in its
  owner's list only), so the lint stays a clean exactly-one check. Sub-file
  splits are prose in SYSTEMS.md §4.1, not globs.
- Globs are repo-root-relative; `**` supported. Prefer directory globs where a
  whole dir belongs to one system; enumerate individual files where a dir is
  split (e.g. `components/project/*` is split across S6/S8/S10/S11/S12/S15 — list
  the files).
- The kernel files (SYSTEMS.md §4.2: `lib/mod.ts`, `lib/types/instance.ts`,
  `lib/consts.ts`, `lib/utils.ts`, `exposed_env_vars.ts`) are claimed by a
  synthetic `SYSTEM_00_kernel` entry (or an explicit `kernel:` allowlist in the
  lint) so they don't read as orphans — they are read-but-don't-own, not
  unowned.

---

## 6. `lint_systems.ts`

Deno script, repo root. Run in CI and/or pre-commit.

1. Glob all `.ts`/`.tsx` under `server/`, `lib/`, `client/src/` (skip `.d.ts`,
   `node_modules`, generated `module_defs_dist`).
2. Parse `globs:` from every `SYSTEM_NN_*.md` frontmatter + the kernel allowlist.
3. For each tracked file, count matching systems.
   - **0 matches → ORPHAN** (a new file nobody claimed — the main thing this
     catches over time).
   - **>1 match → DOUBLE-CLAIM** (two systems' globs overlap — fix the globs;
     custody files are single-owner by construction so should never appear).
4. Print the report; exit non-zero if any orphan or double-claim.
5. Optional second pass: every `docs_absorbed:` entry names a real DOC_* file
   (catches typos and already-deleted docs as Phase 2 progresses).

Hand-verify on ~10 files before trusting it (the same discipline the
import-graph analysis used). Seed expectation: at first run, orphans = the new
files added since the review (should be few); double-claims = 0 if §3 globs are
written carefully.

---

## 7. Order of work (Phase 1)

1. Write `lint_systems.ts` against an empty manifest → confirm it lists ALL
   tracked files as orphans (proves the walker works).
2. Author the 15 SYSTEM stub files' frontmatter `globs`, iterating against the
   lint until orphans = only the genuine kernel set and double-claims = 0.
3. Add the kernel allowlist → orphans = 0.
4. Put the scope/contract/size prose in `SYSTEMS.md` (System details); each stub
   body points there. Add `docs_absorbed` links.
5. Write `SYSTEMS.md` (index + System details + §4 + §5).
6. Decide + create the CROSS_* files (§4) as stubs.
7. Point `CLAUDE.md`'s per-area prose at `SYSTEMS.md`.

Phase 2 then rides each system's review cycle (SYSTEMS.md §5) — no separate
schedule.

## 8. Verification

- `deno run --allow-read lint_systems.ts` → 0 orphans, 0 double-claims.
- Every DOC_* appears in exactly one `docs_absorbed` (or is explicitly listed
  as retired) — no doc orphaned by the mapping.
- Spot-check: pick 3 random tracked files, confirm the system the lint assigns
  matches the SYSTEMS.md System-details scope text.
- Phase 2 per system: the absorbed DOC_* content is in the SYSTEM file, the
  §3a staleness items for that system are fixed, and the old DOC_* files are
  deleted/archived in the same commit.

## 9. Open decisions for Tim

1. **CROSS_* set** — the 2 proposed (UI conventions, client-state), or fold
   into S14/S3? (Recommend the 2.)
2. **Archive vs delete** absorbed DOC_* — `git rm` (history keeps them) or move
   to `_archive_docs/`? (Recommend `git rm`; history suffices.)
3. ~~**Does `SYSTEMS.md` supersede PLAN_SYSTEMS.md**~~ **RESOLVED** — SYSTEMS.md
   is canonical; PLAN_SYSTEMS.md was deleted once its durable content (§3 System
   details, §6/§7.2 → SYSTEM Open items, §7.3 → §3a above) landed.
4. **`PROTOCOL_APP_*` naming/scope** (§1b) — confirm the `PROTOCOL_APP_*` token
   and repo-root location (vs e.g. a `protocols_app/` dir, or `GUIDE_*`).
   Recommend `PROTOCOL_APP_*` at root: it reads as "construction rules,
   app-scoped," parallels panther's `PROTOCOL_<ALL|UI|DENO>_*`, and the distinct
   location keeps `./sync` from ever touching it. `DOC_MIGRATIONS.md` is the
   first one to mint (it is almost pure recipe and you cite it mid-build today);
   the route/worker/AI-tool/help-button recipes split out of their hybrid DOCs
   as those systems' Phase-2 cycles run.
5. **Pure cross-cutting docs that are neither SYSTEM nor PROTOCOL_APP** — the
   §4.3 audits live as a list in `SYSTEMS.md`; confirm that is enough, or do any
   want their own file (most likely candidate: the notify/stamp + version-hash
   invalidation audit, which is the densest).
