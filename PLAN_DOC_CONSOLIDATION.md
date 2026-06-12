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
> Depends on the locked map in
> [PLAN_SYSTEMS.md](PLAN_SYSTEMS.md) §3 (15 systems). Goal: retire the 29
> scattered `DOC_*.md` files in favour of one `SYSTEM_NN_*.md` per system, so
> the canonical topology and its documentation are the same artifact, and a
> delegated "review system X" task opens exactly one file. Resolves
> PLAN_SYSTEMS §8 decisions 4 (manifest) and 5 (promotion path). Independent of
> the in-flight hardening work — can run in parallel.

---

## 1. End state

```
SYSTEMS.md                     # index: the map, §4.1 custody table, §4.2 kernel
                               #   rule, §4.3 cross-cutting audits, §5 execution
                               #   model. (Absorbs the durable parts of
                               #   PLAN_SYSTEMS.md once that plan is spent.)
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

---

## 2. Two phases (don't big-bang the prose)

Porting 29 docs — several stale (PLAN_SYSTEMS §7.3) — in one shot is risky and
wastes the verification. Split it:

**Phase 1 — scaffold (do now, ~half a day).** Map-independent of hardening.

1. Create `SYSTEM_NN_*.md` (×15) as stubs: each has the **frontmatter manifest**
   (§5), the system's **scope/contract/size** lifted verbatim from PLAN_SYSTEMS
   §3, and a `docs_absorbed:` list that *links* (does not yet inline) the
   DOC_* files mapped to it (§3 table). No prose porting yet.
2. Create `SYSTEMS.md` from PLAN_SYSTEMS §3 intro + §4 + §5.
3. Write `lint_systems.ts` (§6) and get it green (every file claimed once).
4. Decide the `CROSS_*` set (§4).

Outcome: the manifest + lint land immediately; the topology is enforceable
against the tree from day one. DOC_* files still exist, now linked from their
owning SYSTEM file.

**Phase 2 — prose port (incremental, inside each system's review cycle).**

When a system's review cycle runs (PLAN_SYSTEMS §5), porting its DOC_* prose
into the SYSTEM file IS part of the review — you're verifying the doc against
code anyway, so staleness gets fixed in the same motion. On completing a
system's port: inline the content, fix the §7.3 staleness items for that
system, then `git rm` (or move to `_archive_docs/`) the absorbed DOC_* files.

This means the DOC_* set shrinks system-by-system as cycles complete, rather
than a single fragile 29-file migration.

---

## 3. DOC_* → SYSTEM mapping

From the doc-audit. "Absorbed by" = the SYSTEM file that inlines it in Phase 2.
"Also informs" = a system/cross-doc that links it but doesn't own it.

| DOC_* | Absorbed by | Also informs |
|---|---|---|
| DOC_API_ROUTES | S1 | — |
| DOC_ACCESS_CONTROL | S1 | S15 |
| DOC_DB_ACCESS_LAYER | S2 | — |
| DOC_MIGRATIONS | S2 | §4.3.7 pairing audit (every domain system) |
| DOC_SSE_REALTIME | S3 | §4.3.1 notify audit |
| DOC_VALKEY_CACHE | S3 | S9 (key/payload semantics) |
| DOC_STATE_RULES + DOC_STATE_MGT_TIERS/_INSTANCE/_PROJECT | CROSS_CLIENT_STATE (see §4) | S3 machinery, all client systems |
| DOC_TASK_EXECUTION_DIRTY_STATE | S8 | — |
| DOC_WORKER_ROUTINES | S8 | S5 (staging workers) |
| DOC_MODULE_EXECUTION | S8 | — |
| DOC_MODULE_UPDATES | S8 | — |
| DOC_POPULATION_CSV | S8 | S6 |
| DOC_IMPORT_PIPELINE | S5 | S6 (structure ELT) |
| DOC_DHIS2_INTEGRATION | S7 | — |
| DOC_AI_PROXY_AND_USAGE_GOVERNANCE | S13 | — |
| DOC_AI_TOOL_SCHEMAS | S13 | — |
| DOC_PRESENTATION_OBJECT_QUERY_PIPELINE | S9 | — |
| DOC_period_column_handling | S9 | §4.3.5 calendar audit |
| DOC_DISAGGREGATION_OPTIONS_HANDLING | S9 | S6 |
| DOC_ROLLUP_ROWS | S9 | — |
| DOC_SPECIAL_CHART_MODES | S10 | — |
| DOC_DESIGN_SYSTEM | CROSS_UI_CONVENTIONS (see §4) | S10, S11, S12, S14 |
| DOC_BUILD_INSTRUCTIONS | CROSS_UI_CONVENTIONS | S14 |
| DOC_TRANSLATION | S14 | §4.3.6 t3 audit |
| DOC_HELP_BUTTONS | S14 | — |
| DOC_ACCESS_DBS | S15 | S2 |

Undocumented systems (no DOC_* to absorb — their SYSTEM file is written fresh
from code in Phase 2): **S4** (Assets & Upload), **S12** (Documents & Sharing —
the largest doc gap). S6 and S11 are only partially covered.

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
  split (e.g. `components/project/*` is split across S5/S8/S10/S11/S12/S15 — list
  the files).
- The kernel files (PLAN_SYSTEMS §4.2: `lib/mod.ts`, `lib/types/instance.ts`,
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
4. Lift scope/contract/size prose from PLAN_SYSTEMS §3 into each stub body;
   add `docs_absorbed` links.
5. Write `SYSTEMS.md` (index + §4 + §5 from PLAN_SYSTEMS).
6. Decide + create the CROSS_* files (§4) as stubs.
7. Point `CLAUDE.md`'s per-area prose at `SYSTEMS.md`.

Phase 2 then rides each system's review cycle (PLAN_SYSTEMS §5) — no separate
schedule.

## 8. Verification

- `deno run --allow-read lint_systems.ts` → 0 orphans, 0 double-claims.
- Every DOC_* appears in exactly one `docs_absorbed` (or is explicitly listed
  as retired) — no doc orphaned by the mapping.
- Spot-check: pick 3 random tracked files, confirm the system the lint assigns
  matches the §3 scope text.
- Phase 2 per system: the absorbed DOC_* content is in the SYSTEM file, the
  §7.3 staleness items for that system are fixed, and the old DOC_* files are
  deleted/archived in the same commit.

## 9. Open decisions for Tim

1. **CROSS_* set** — the 2 proposed (UI conventions, client-state), or fold
   into S14/S3? (Recommend the 2.)
2. **Archive vs delete** absorbed DOC_* — `git rm` (history keeps them) or move
   to `_archive_docs/`? (Recommend `git rm`; history suffices.)
3. **Does `SYSTEMS.md` supersede PLAN_SYSTEMS.md** once Phase 1 lands, or do
   they coexist until Phase 2 finishes? (Recommend: SYSTEMS.md becomes
   canonical immediately; PLAN_SYSTEMS.md gets a "superseded by SYSTEMS.md"
   banner and is deleted when its last unported section is gone.)
