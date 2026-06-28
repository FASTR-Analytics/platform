# PLAN: Facility Import Update Modes — Redesign

Status: **proposal, for review.** No code written yet.

## Trigger

A Ghana facility-tagging import "succeeded" with no error but wrote nothing: the
file was keyed by Ghana HMIS codes (`AA00190201`) while the backbone is keyed by
DHIS2 IDs (`a03CL7iNOdC`), so zero rows matched. Investigation showed the failure
is a symptom of a muddled update-mode model, not a one-off. A guard now exists
(orphan check on the update-only strategies); this plan replaces the model the
guard is patching.

## Goals

1. Make every facility column except `facility_id` **optional at upload** — an
   instance can have `facility_type` (or admin areas, for an update) turned on yet
   upload a file that omits it.
2. Decide column scope **once, at mapping** — never re-ask at integration.
3. Collapse the 6 mechanics-named modes into **three intent-named** ones that are
   **crystal clear** to a country team — the overriding constraint. Clarity comes
   from the labels *and* from a live, plain-language "here's exactly what will
   happen" confirmation at step 4 (filled with real match numbers).
4. Make the wrong-ID-system failure **visible before commit**, for every mode.
5. Minimal UI change — the stepper and flow are unchanged; only the step-2
   required-set, the step-4 mode list, and the step-4 confirmation panels move.

## Non-goals

- No change to family selection (HMIS vs HFA chosen up front, untouched).
- No DB migration: the mode is **transient** (chosen at step 4, never stored).

---

## Current state (what we're replacing)

Flow: `step_1 upload → step_2 column mapping → step_3 staging → step_4 pick mode + integrate`.

**Six modes** (`StructureIntegrateStrategy`, `lib/types/structure.ts`):

| # | Mode | Reality |
|---|------|---------|
| 1 | `first_delete_all_then_add_all` | replace registry |
| 2 | `add_all_and_update_all_as_needed` | upsert — **the default**; silently inserts phantoms on ID mismatch |
| 3 | `add_all_new_rows_and_ignore_conflicts` | add-new-only (skip existing) |
| 4 | `add_all_new_rows_and_error_if_any_conflicts` | add-new-only (error on existing) |
| 5 | `only_update_optional_facility_cols_by_existing_facility_id` | update existing, all enabled cols |
| 6 | `only_update_selected_cols_by_existing_facility_id` | update existing, user-picked cols |

Problems:
- **5 ⊂ 6**, and **3 vs 4** differ by one boolean. Names describe SQL mechanics.
- **Column scope is decided twice:** all enabled columns are *forced* at mapping
  ([step_2_csv.tsx:37,64](client/src/components/structure_import/step_2_csv.tsx#L37)),
  then mode 6 makes the user pick again.
- **Column handling is inconsistent:** staging materializes the *mapped* columns,
  but the insert modes (1–4) drive off *all enabled* columns
  ([integrate_structure_from_staging.ts:130-137](server/server_only_funcs_importing/integrate_structure_from_staging.ts#L130-L137)).
  This only works today because mapping forces all-enabled to be mapped.
- **No safety signal** before commit, and the **default is the most dangerous
  mode** (silently inserts on ID mismatch — the Ghana failure).

---

## New model

### Principle: mapping owns column scope; the staging table is the source of truth

The columns a file governs = the columns actually mapped in step 2, which are
exactly the columns the stager materialized into `temp_structure_staging`.
Integration writes **only those**, driven off the staging table's real column
list — never the config-enabled set, never re-derived elsewhere. Only
`facility_id` is mandatory; everything else (admin areas + metadata) is a normal
optional column with no special-casing.

### Step 2 — only `facility_id` is required

- **Required:** `facility_id` only — the match key for every intent.
- **Optional:** admin areas (`admin_area_1..maxAdminArea`) **and** every enabled
  metadata column (`facility_name`, `facility_type`, `facility_ownership`,
  `facility_custom_1..5`). All skippable, all treated identically.
- The insert-capable intents (Replace, Add & update) need admin to place new
  rows; that requirement is enforced **at step 4 against the chosen intent**
  (see below), not forced on everyone at mapping. This is the only way to let a
  tag-only "Update existing only" file omit admin entirely, and it kills the
  forced-admin → silent-re-parent footgun.

### Three intents (replaces the 6 modes)

`facility_id` is the match key. "Mapped columns" = every column you mapped
(admin + metadata) = the staging table's columns.

| Intent | Existing facility in file | File row with a new ID | Existing facility absent from file |
|--------|---------------------------|------------------------|-------------------------------------|
| **Replace registry** | n/a (all deleted first) | inserted | **deleted** |
| **Add & update** | mapped cols updated | inserted | left as-is |
| **Update existing only** | mapped cols updated | **rejected** (orphan error) | left as-is |

- **Admin areas are just mapped columns** — no special case. If you map them and
  a value differs, the facility moves in the hierarchy; if you don't map them,
  placement is left alone. Because admin is optional, "Update existing only" with
  a tag-only file never touches placement at all. When admin *is* mapped on an
  update, integration must run the admin-area insert + `cleanupUnusedAdminAreas`
  (FK to `admin_areas_4`), and the consequence summary reports "N facilities will
  change administrative placement."
- **Update existing only** merges old modes 5 & 6; the orphan guard is now its
  native behaviour (any file `facility_id` not in the backbone aborts the import
  with the offending IDs — the Ghana fix).
- The crisp line between **Add & update** and **Update existing only**: *does it
  add facilities with new IDs, or reject them?* Both update whatever you mapped on
  facilities that already exist — so **Add & update's consequence summary must
  spell out that existing facilities are overwritten** (Tim: an append that also
  updates is the intended behaviour; clarity carries the load, see step 4).

### Column write semantics (uniform)

- **Unmapped column →** untouched on existing facilities; `NULL` on new rows.
- **Mapped column, value present →** written.
- **Mapped column, cell blank →** written as blank (Tim's decision: you mapped it,
  you govern it). Admin can't be blanked — staging rejects blank-admin rows for a
  file that maps admin, as today.

### Step 4 — make the consequences unmissable

- **No default mode.** The radio starts unselected and "Finalize" is disabled
  until the user chooses — the path of least resistance must not be a destructive
  insert.
- **Match preview (safety net, all intents, before any choice),** computed at
  staging against the **correct family table**, over **distinct staged IDs**:

  > 11,300 facilities in file · **0 already exist in the backbone** · 11,300 new

  "0 already exist" screams mismatch regardless of mode.
- **Dynamic consequence summary (clarity keystone)** — once an intent is chosen,
  a plain-language line with the live numbers:

  > **Add & update:** 0 existing updated · **11,300 NEW facilities added** (their
  > IDs don't match anything in the backbone — likely the wrong ID column)
  >
  > **Update existing only:** 0 of 11,300 rows match — **import rejected**
  >
  > **Replace registry:** all 11,242 current facilities **deleted**, replaced with
  > 11,300 from your file

  Plus "N facilities will change administrative placement" when admin is mapped.
- **Columns-to-update notice** (human labels, translated): "This will write:
  **Facility Type, Ownership, Status.** Unmapped columns are left unchanged."
- **Post-commit result**: report actual inserted / updated / deleted counts
  (currently discarded by the wrapper) so the user sees what happened.

---

## Decisions (Tim)

1. **Three intents, no separate add-only.** "Add & update" *is* the insert and
   covers "add new"; old modes 3 & 4 dropped. Settled — not reopening.
2. **Admin areas are fully optional.** Only `facility_id` required at mapping;
   admin required only for the insert-capable intents (validated at step 4). This
   removes the forced-admin/silent-re-parent contradiction. (Brings forward the
   previously-deferred "full admin optionality"; see staging change below.)
3. **Blank mapped cell overwrites to blank.**

## Corrections from the adversarial plan review (must-fix, folded in above)

- **DHIS2 has no column mapping.** `step2Result` for DHIS2 is `{selectedLevels}`,
  and DHIS2 staging populates only `facility_name` (other enabled cols staged as
  `''`). Source of truth is therefore the **staging table's real columns**, not
  `step2Result`; DHIS2's governed set is `facility_name` (+ admin from the tree).
  Without this, "Add & update" over DHIS2 would blank every facility's metadata.
- **Admin-move FK on the update path.** Updating `admin_area_*` to a tuple not in
  `admin_areas_4` throws; the update path must run admin-insert + cleanup **when
  admin is mapped** (no-op when it isn't).
- **Replace must preserve** the HFA weight stash/restore and HMIS deferred-FK
  logic ([integrate_structure_from_staging.ts:395-429](server/server_only_funcs_importing/integrate_structure_from_staging.ts#L395-L429)) — it's today's
  `first_delete_all_then_add_all`, not a fresh delete-then-insert.
- **`facilityMatch` is stored state.** It lands in `step_3_result`
  (`StructureStagingResult`); make it **optional** with a step-4 fallback so
  in-flight attempts across a deploy don't break.

## Final labels & copy (EN / FR / PT)

Matches the codebase's established vocabulary — facilities = "établissements de
santé" / "estabelecimentos de saúde", admin areas = "unités administratives" /
"zonas administrativas", and the destructive marker follows the existing
"Replace all existing users (DANGEROUS)" precedent. Numbers are named `{slots}`
so translations stay grammatical.

**Intent radio options (label + helper text):**

1. Replace — destructive, marked:
   - EN: **Replace all existing facilities (DANGEROUS)** — "Delete every facility currently in this list, then add all facilities from your file."
   - FR: **Remplacer tous les établissements existants (DANGEREUX)** — "Supprimer tous les établissements actuels de cette liste, puis ajouter tous ceux de votre fichier."
   - PT: **Substituir todos os estabelecimentos existentes (PERIGOSO)** — "Eliminar todos os estabelecimentos atuais desta lista e adicionar todos os do seu ficheiro."
2. Add & update:
   - EN: **Add new facilities and update existing ones** — "New IDs are added. Existing IDs are updated with the columns you mapped — existing values are overwritten."
   - FR: **Ajouter les nouveaux établissements et mettre à jour les existants** — "Les identifiants nouveaux sont ajoutés. Les identifiants existants sont mis à jour avec les colonnes associées — les valeurs existantes sont remplacées."
   - PT: **Adicionar novos estabelecimentos e atualizar os existentes** — "Os identificadores novos são adicionados. Os existentes são atualizados com as colunas que associou — os valores existentes são substituídos."
3. Update existing only:
   - EN: **Update existing facilities only (reject unknown IDs)** — "Only facilities already in the list are updated. If your file contains any ID that isn't in the list, the import is rejected and nothing changes."
   - FR: **Mettre à jour uniquement les établissements existants (rejeter les identifiants inconnus)** — "Seuls les établissements déjà présents sont mis à jour. Si votre fichier contient un identifiant absent de la liste, l'importation est rejetée et rien n'est modifié."
   - PT: **Atualizar apenas os estabelecimentos existentes (rejeitar identificadores desconhecidos)** — "Apenas os estabelecimentos já presentes são atualizados. Se o seu ficheiro contiver um identificador que não esteja na lista, a importação é rejeitada e nada é alterado."

**Match preview** — EN "{total} facilities in your file · {existing} already exist
in the list · {new} new" / FR "{total} établissements dans votre fichier ·
{existing} déjà présents · {new} nouveaux" / PT "{total} estabelecimentos no seu
ficheiro · {existing} já existem · {new} novos".

**Consequence summary** (per chosen intent):
- Add & update — EN "{existing} existing facilities updated · {new} new added." / FR "{existing} établissements existants mis à jour · {new} nouveaux ajoutés." / PT "{existing} estabelecimentos existentes atualizados · {new} novos adicionados."
- Update existing only — EN "{unmatched} of {total} rows match no existing facility — import will be rejected." / FR "{unmatched} sur {total} lignes ne correspondent à aucun établissement — l'importation sera rejetée." / PT "{unmatched} de {total} linhas não correspondem a nenhum estabelecimento — a importação será rejeitada."
- Replace — EN "All {current} current facilities deleted, replaced with {total} from your file." / FR "Les {current} établissements actuels supprimés, remplacés par {total} de votre fichier." / PT "Os {current} estabelecimentos atuais eliminados, substituídos por {total} do seu ficheiro."
- Admin moves (when admin mapped) — EN "{n} facilities will move to a different administrative area." / FR "{n} établissements changeront d'unité administrative." / PT "{n} estabelecimentos mudarão de zona administrativa."

**Columns notice** — EN "This will write these columns on matched facilities:
{columns}. Unmapped columns are left unchanged." / FR "Ceci écrira ces colonnes sur
les établissements correspondants : {columns}. Les colonnes non associées restent
inchangées." / PT "Isto irá escrever estas colunas nos estabelecimentos
correspondentes: {columns}. As colunas não associadas permanecem inalteradas."
`{columns}` uses each column's human label, including the instance's custom labels
(e.g. Ghana's `facility_custom_2` → "Status").

**`facility_name` human label** (missing in `disaggregation_labels.ts`) — EN
"Facility Name" / FR "Nom de l'établissement" / PT "Nome do estabelecimento de
saúde".

**Destructive confirm:** the DANGEROUS marker + the explicit "{current} deleted"
count is the friction, matching the existing "Replace all users" pattern — no
extra typed-confirm.

## Genuinely open

Nothing blocking. Two judgment calls you may want to eyeball (easy to change, not
gating implementation):
- The exact intent wording above (it's craft; I've optimised for telegraphing the
  consequence over brevity).
- FR uses "établissements de santé" to match the dominant translated table; the
  current structure-import screens say "formations sanitaires" — I'd standardise
  on one (recommend "établissements de santé") during implementation.

---

## Blast radius

Transient mode → **no migration.** Areas:

| File | Change |
|------|--------|
| `lib/types/structure.ts` | `StructureIntegrateStrategy` → 3 intents; drop `selectedColumns`/`SelectableColumn`; add **optional** `facilityMatch` + the staged-column list to `StructureStagingResult` |
| `lib/api-routes/instance/structure.ts` | Zod schema → 3 intents |
| `server/server_only_funcs_importing/integrate_structure_from_staging.ts` | rewrite switch to 3 intents; drive columns off the **staging table**; orphan check native to update-only; admin insert+cleanup when admin mapped; preserve Replace's weight-stash/deferred-FK; delete dead modes |
| `server/server_only_funcs_importing/stage_structure_from_csv.ts` + `…_dhis2.ts` | **admin columns nullable** when unmapped (the staging change); return the staged optional/admin column set + `facilityMatch` (distinct staged IDs vs family backbone) |
| `server/db/instance/structure.ts` | wrapper drives off the staging column set (not `getEnabledOptionalFacilityColumns`); thread match stats; surface post-commit counts |
| `client/src/components/structure_import/step_2_csv.tsx` (+ `_dhis2`) | only `facility_id` required |
| `client/src/components/structure_import/index.tsx` | thread the staged column set / match stats into `Step4` |
| `client/src/components/structure_import/step_4.tsx` | 6→3 modes, **no default**; remove column multiselect; match preview + dynamic summary + columns notice; per-intent requirement validation (insert intents need admin mapped) |
| `lib/disaggregation_labels.ts` | add `facility_name` human label |

**DHIS2:** shares `integrate_structure_from_staging` + `temp_structure_staging`,
so the intent rewrite and match preview apply — but its governed column set is
`facility_name` only (see corrections), and it must narrow its staging
accordingly rather than staging all-enabled-as-blank.

---

## Implementation phases

1. **Types + schema** (`lib`): 3-intent union; optional `facilityMatch` + staged
   column list on `StructureStagingResult`.
2. **Integration rewrite** (server): 3 intents, **staging-column-driven**, native
   orphan check, admin insert+cleanup when admin mapped, Replace preserves
   weight-stash/deferred-FK. Verify by executing a harness against a scratch DB.
3. **Staging** (server): nullable admin when unmapped; compute the staged column
   set + `facilityMatch` (distinct IDs vs correct family); narrow DHIS2 staging.
4. **UI** (client): step-2 only-`facility_id`-required; step-4 3 modes + no
   default + the three confirmation panels + per-intent admin-required check;
   thread column set/match via `index.tsx`; `facility_name` label; EN/FR/PT.
5. **Delete** the obsolete mode code, `SelectableColumn`, the multiselect.

Integration (2) carries the design — adversarial pass before the UI lands.

## Risks / verification

- **Staging-column threading** is the correctness keystone: integration uses the
  staging table's real columns, full stop — for both CSV and DHIS2.
- **Admin-move FK + cleanup** on the update path; **HFA weights** on Replace —
  both must be carried forward verbatim from the current implementation.
- **Match stats** computed against the **chosen family** (HMIS vs HFA) over
  distinct staged IDs — a wrong-family count would re-cause Ghana with a green
  light. Snapshot at staging; recompute/guard if backbone changes before commit.
- **Blank-overwrite is intentional** (Tim) — surfaced in the consequence summary,
  not silent.
- Verify by executing (lib/server run directly), then browser spot-check each
  intent per family against a real instance before deploy.
