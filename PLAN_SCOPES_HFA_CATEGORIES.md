# PLAN: HFA category and service category in scopes

A scope's HFA section gains two dimensions: a list of HFA categories and a list
of HFA service categories. Each filters the HFA results objects that have its
column, as the indicator list does, so an admin can limit a scope to "the RMNCH
service category" without listing every indicator in it, and the limit stays
right when an indicator is added to the category later.

**Next step: Do 1.** Each session sets this line in its final commit. Its values
are `Do 1`, `Review 1` and `Fix 1`. The review of step 1 deletes this file.

All work is on `version2`. Repos touched: this app only.

---

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`. The app's floor, conditional gates
and docs rule are `PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_SCOPES_HFA_CATEGORIES.md."
- Branch: `version2` (PROTOCOL_APP_PLANS names `tim-branch`; this plan overrides
  it).
- Floor and conditional gates: as PROTOCOL_APP_PLANS lists them.
  `deno task
  test` has two known failures outside this plan, at
  `server/tests/report_fastr_word_test.ts:119` and `:164`.
- A dev server holds port 8000, so the boot gate is
  `PORT=8011 deno run --allow-all --env-file --unstable-broadcast-channel main.ts`
  (a reviewer uses 8012), stopped once it prints "Listening". Never `./run`.
- Build log: §8. Last step: 1.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, SYSTEM_08 "Scope",
  SYSTEM_09 "The scoped view", SYSTEM_12 "Scopes", SYSTEM_15 "The Scopes page",
  PROTOCOL_APP_QUERY_RIG, §2 and §3 of this plan, the step's own section in §4,
  and §8.
- File edits are made with the Edit and Write tools, never with a script run
  through the shell.

Vocabulary. **Section**: one family's part of a `ScopeDefinition` (`hmis`,
`hfa`, `iceh`). **List part**: a predicate of the form
`CAST(<column> AS VARCHAR) IN (...)`. **Set column**: a column whose cell is a
delimiter-joined set of ids (`rmnch|nutrition`). **The default principle**: a
dimension filters a results object only when the object has a column for it.

---

## 1. The problem

- **The HFA section limits data by indicator only.** Its data dimensions are
  `modules` and `indicators` (`lib/types/scope.ts:43-44`, `:56-62`). Limiting a
  scope to one service category means listing every indicator in it, and the
  list goes stale when an indicator joins the category.
- **The columns already exist.** Every HFA results object of `m010` carries
  `hfa_category`, `hfa_sub_category` and `hfa_service_category` beside
  `hfa_indicator`, each nullable TEXT (`wb-fastr-modules/m010/definition.json`,
  the five `M10_hfa_*` results objects).
- **`hfa_service_category` is a set column.** Its cell is a pipe-joined set of
  ids, and the query engine filters it by set overlap, not equality:
  `string_to_array(UPPER(<col>), '|') && ARRAY[...]`
  (`server/server_only_funcs_presentation_objects/query_helpers.ts:387-395`),
  with the delimiter in `MULTI_MEMBERSHIP_DELIMITER`
  (`lib/validate_fetch_config.ts:181`).
- **The predicate has one place to add a part.** `scopePredicateFor`
  (`server/run_query/run_read.ts:822`) ANDs the section's parts, each applied
  only when the results object has its column (`:848-853`).
- **The editor already has the option lists.** The authoring context carries
  `hfaTaxonomy.categories` and `hfaTaxonomy.serviceCategories`, each
  `{ id, label }`, and the column values are those ids
  (`lib/types/hfa_types.ts:77-84`).
- **The schema is strict**, so a stored definition without the new keys fails to
  parse. Migration `204_scopes.sql` writes the HFA section in three places
  (`:36`, `:77`, `:103`) and has not shipped. The dev database holds three scope
  rows in the current shape.

---

## 2. The model

The HFA section becomes:

```ts
hfa:
  | { include: false }
  | {
    include: true;
    modules: string[] | null;
    indicators: string[] | null; // column hfa_indicator
    categories: string[] | null; // column hfa_category
    serviceCategories: string[] | null; // column hfa_service_category
    adminArea2: string | null;
    timePoints: string[] | null;
  };
```

Null means no limit, and an empty list is refused, as for every other list. The
HMIS and ICEH sections are unchanged.

Two more parts join the AND in `scopePredicateFor`, for a results object of
family `hfa`:

| Dimension          | Results object has     | Part                                                                             |
| ------------------ | ---------------------- | -------------------------------------------------------------------------------- |
| Categories         | `hfa_category`         | `CAST(hfa_category AS VARCHAR) IN (...)`                                         |
|                    | no `hfa_category`      | none                                                                             |
| Service categories | `hfa_service_category` | `string_to_array(UPPER(hfa_service_category), '\|') && ARRAY[<upper-cased ids>]` |
|                    | no such column         | none                                                                             |

The service-category part is the engine's own filter form: a row passes when its
set shares at least one id with the list. The row is served as it is, so its
other memberships stay visible. A blank cell in either column fails its part, as
a blank cell fails any list part.

The hash follows the existing rule: a null is left out, so every stored
definition keeps its hash and no figure goes stale. The two lists are sorted and
de-duplicated like the others.

---

## 3. Rulings

**R1. Two dimensions, category and service category. Sub-category is out.**
(Tim) It nests under category, and the indicator list already covers a narrower
cut.

**R2. They are parts of the HFA section only**, named `categories` and
`serviceCategories`.

**R3. The default principle holds.** Each part applies only to a results object
that has its column. Neither can remove a whole table: only an excluded section
or the module list does that.

**R4. The parts are ANDed with each other and with the indicator list.** A scope
that sets both an indicator list and a category list shows the indicators that
are in both.

**R5. Service categories match by set overlap**, in the engine's form and with
`MULTI_MEMBERSHIP_DELIMITER`, upper-casing both sides as the engine does. The
category part is a list part like indicators, compared as written.

**R6. Migration 204 is edited in place** (nothing that ran it has shipped): each
HFA section it writes gains `"categories": null` and
`"serviceCategories": null`. The dev database's scope rows are rewritten once by
an uncommitted script that adds the two null keys to every included HFA section.
No stored figure is re-stamped, because no hash changes. The Do session records
what the script did in §8.

**R7. No cache bump.** No cached payload changes shape, and a definition that
sets either list hashes to a token no existing entry carries.

**R8. The authoring context is unchanged.** It is cut by sections and module
lists only; category lists are package metadata.

**R9. The editor's HFA tab gains two limited lists**, "Limit categories" and
"Limit service categories", between time points and modules, with options from
`hfaTaxonomy.categories` and `hfaTaxonomy.serviceCategories` (label with the id
in parentheses, as the other lists show). A stored id the options lack is kept
and annotated, as for the other lists. The scopes table's HFA cell and the
copilot's HFA scope line name the two limits.

---

## 4. Steps

### Step 1: The two dimensions, end to end

**Surface.**

- lib: `lib/types/scope.ts`.
- Schema and data: `server/db/migrations/instance/204_scopes.sql`.
- Server: `server/run_query/run_read.ts`.
- Client: `client/src/components/scopes/scope_editor.tsx`,
  `client/src/components/scopes/scopes.tsx`,
  `client/src/components/products/copilot/_shared/build_system_prompt.ts`.
- Tests and rig: `server/tests/scope_definition_hash_test.ts`,
  `server/tests/scope_routes_test.ts`, `server/tests/figure_staleness_test.ts`,
  `query_rig/cases.ts`, `query_rig/fixtures.ts`.
- Docs: SYSTEM_08 "Scope", SYSTEM_09 "The scoped view", SYSTEM_12 "Scopes",
  SYSTEM_13 (the system prompt's scope section), SYSTEM_15 "The Scopes page",
  PROTOCOL_APP_QUERY_RIG.
- Any other file that fails to typecheck because of the type change and needs
  only the mechanical edit that restores it. Each is listed in §8.

**Deliverable.**

- R2: the schema, `ALL_DATA_SCOPE_DEFINITION` and `geographyOnlyScopeDefinition`
  carry the two keys as null. The schema refuses an empty list in either.
- R3 to R5: the two parts in `scopePredicateFor`, the service-category part
  built from `MULTI_MEMBERSHIP_DELIMITER` and every value escaped with
  `escapeSqlLiteral`.
- R6: migration 204's three HFA sections, and the dev conversion.
- R9: the two lists in the editor's HFA tab, saved and reloaded without change;
  the scopes table and the copilot prompt name them.
- SYSTEM_09's predicate table has the two rows, and the prose that lists the HFA
  section's dimensions (SYSTEM_08, 12, 15) names them.

**Not in this step.** Sub-category (R1). Category limits for HMIS or ICEH.
Cutting the authoring context's taxonomy to the scope (R8).

**Gates.** On top of the floor:

- `./validate_queries` with matrix rows, each on all five read kinds, for: a
  category list that removes a group; a service-category list matching a row
  whose set holds the id among others; a service-category list matching no row;
  each dimension not applying to an HFA results object that lacks its column;
  each list not touching an HMIS results object; the two lists and the indicator
  list set together.
- A mutation row in PROTOCOL_APP_QUERY_RIG for each new part (the part dropped),
  and one for the service-category part turned into an equality match, each run
  and its red count recorded.
- `scope_definition_hash_test.ts`: each new list moves the hash, a null one does
  not, and the schema refuses an empty one. `figure_staleness_test.ts` still
  proves migration 204's "All data" literal parses to
  `ALL_DATA_SCOPE_DEFINITION`.
- `./validate_migrations`, `./validate_fresh_boot`,
  `./validate_migrations_replay`, `./validate_consolidation_replay`.

**Ends with.** One commit, green. The review deletes this file.

---

## 5. Gates catalogue

| Gate                                | First reached |
| ----------------------------------- | ------------- |
| The floor                           | 1             |
| `./validate_queries`                | 1             |
| The four migration gates            | 1             |
| Hash and schema test                | 1             |
| Mutation rows for the two new parts | 1             |

---

## 6. Out of scope

- HFA sub-category as a dimension (R1).
- A category or service-category dimension for HMIS or ICEH.
- Filtering the authoring context's HFA taxonomy by the scope (R8).
- Showing only the scope's categories in the figure editor's filter options.
  Option lists already come from the scoped view, so they narrow by themselves.

---

## 7. Rollout and rollback

Nothing ships on its own. This rides the same release as the scopes work
(migrations 204 and 205), after PLAN_PRODUCTS_RESTRUCTURE's fleet deploy,
through `./deploy_testing` then `./deploy`.

Every scope that exists at deploy time is seeded by migration 204 with both
lists null, so nothing changes for an existing product. Rollback is the scopes
release's rollback: a restore of the main database plus the previous image.

---

## 8. Build log

| Date | Step | Entry |
| ---- | ---- | ----- |
