# Module Loading & Execution

How a versioned R module is loaded (registry → GitHub/local → Zod → translate), how its R script is parameterized (marker substitution), executed (Docker in prod / bare `Rscript` in dev), streamed, and ingested back as results tables.

> The decision of *when* to reinstall/rerun on a definition change (the `compare_definitions` matrix) is [DOC_MODULE_UPDATES.md](DOC_MODULE_UPDATES.md) — not restated here. The dirty/trigger machine that *causes* a run is [DOC_TASK_EXECUTION_DIRTY_STATE.md](DOC_TASK_EXECUTION_DIRTY_STATE.md); the worker lifecycle around it is [DOC_WORKER_ROUTINES.md](DOC_WORKER_ROUTINES.md). `sql.unsafe` safety is owned by [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md); the GitHub-authored definition schema is in [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md); period helper-column handling is [DOC_period_column_handling.md](DOC_period_column_handling.md).

---

## Principles

1. **Loading is read-only and side-effect-free.** `fetchModuleFiles` + `getModuleDefinitionDetail` fetch, validate, and translate — they touch no DB and no disk sandbox.
2. **GitHub is pinned by commit SHA.** In prod, fetch the HEAD SHA for the module path and fetch raw content at that SHA — this defeats GitHub's ~5-minute raw CDN cache so a just-pushed module is seen immediately.
3. **Authored definitions must match the schema exactly.** `moduleDefinitionGithubSchema.safeParse` — invalid `definition.json` fails at fetch time with the exact error paths. No silent normalization.
4. **Only definition-declared columns are materialized.** A results CSV header not present in the definition's `createTableStatementPossibleColumns` is a hard error — the R output can't smuggle columns into the DB.
5. **Prod and dev must stay behaviorally equivalent.** Docker-vs-`Rscript` and GitHub-vs-local are parallel branches that must produce the same result; only deliberate differences (the synthetic `loc-` gitRef) are allowed.

---

## The System

```text
  LOAD (read-only)                              fetchModuleFiles(moduleId)
  MODULE_REGISTRY.find(id) → {owner,repo,path}
    prod:  GET commits?path=… → HEAD SHA (gitRef)
           GET raw.githubusercontent/<owner>/<repo>/<SHA>/<path>/{definition.json,script.R}
    dev:   read _MODULES_LOCAL_DIR/<path>/{definition.json,script.R}; gitRef = loc-<rand8>
    → moduleDefinitionGithubSchema.safeParse(definition)   (throws with issue paths)
    → stripFrontmatter(script)
    → getModuleDefinitionDetail: translate label/metrics/configRequirements (resolveTS),
      derive default presentation objects from vizPresets

  EXECUTE (worker, run_module_iterator — async generator)
    disk-space check → emptyDir(sandbox/<project>/<module>) → DROP ro_* tables
    → open ___logs___.txt
    → getScriptWithParameters(...) → write ___script___.R
    → copy assets
    → prod: docker run --name fastr-run-<module>-<runToken> -v <sandbox_external>:/home/docker -w …/<module> <image> Rscript ___script___.R
      dev:  Rscript ___script___.R  (cwd = sandbox_external/<project>/<module>)
    → merge stdout(r-output)/stderr(r-error) → yield RunStreamMsg → SSE (notifyProjectRScript)
    → await exit; sleep 2000ms (let R flush CSVs)
    → verify every results CSV exists (throw → bad-close)
    → storeResultsObject: CREATE ro_<uuid> from CSV headers → COPY → DROP helper columns
    → good-close / bad-close
```

### Loading (`server/module_loader/load_module.ts`)

`MODULE_SOURCE = _IS_PRODUCTION ? "github" : "local"`. `MODULE_REGISTRY` (static) maps a `ModuleId` to `{ owner, repo, path }`.

- **local (dev):** read `definition.json` + `script.R` from `_MODULES_LOCAL_DIR/<path>`; `gitRef = "loc-" + 8 random hex` (so dev always looks "updated").
- **github (prod):** `GET /repos/<owner>/<repo>/commits?path=<path>&per_page=1` → `gitRef = commits[0].sha`; then fetch `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>/…` with `ref = gitRef ?? "main"`. Using the SHA, not `main`, bypasses the raw CDN cache.
- both call `validateDefinition` (`moduleDefinitionGithubSchema.safeParse`, throws listing `path: message` issues) and `stripFrontmatter` on the script.

`getModuleDefinitionDetail(id, language)` translates label/metrics/`configRequirements` via `getTranslateFunc(language)` + `resolveTS`, derives default presentation objects from each metric's `vizPresets` that carry `createDefaultVisualizationOnInstall`, and returns `ModuleDefinitionDetail & { gitRef }`. The gitRef is persisted as `compute_def_git_ref` / `presentation_def_git_ref` and (on a successful run) copied to `last_run_git_ref` — these drive update detection ([DOC_MODULE_UPDATES.md](DOC_MODULE_UPDATES.md)).

### Parameterization (`server/server_only_funcs/get_script_with_parameters.ts`)

Dispatch on `scriptGenerationType`:
- `calculated_indicators` → `getScriptWithParametersCalculatedIndicators` (requires the calculated-indicators snapshot).
- `hfa` → `getScriptWithParametersHfa` (requires `knownDatasetVariables` + HFA indicator snapshots).
- default → inline substitution.

The worker (`run_module_iterator`) pre-loads the right snapshot per type and the generator **throws if its required snapshot is empty** ("Re-import HMIS data" / "Update your project's HFA data"). The default generator does `str.replaceAll(...)`:

| Marker | Replacement |
|--------|-------------|
| `COUNTRY_ISO3` | `"<iso3 \|\| UNKNOWN>"` |
| dataset dataSource `replacementString` | `'../datasets/<datasetType>.csv'` |
| results-object dataSource `replacementString` | `../<moduleId>/<replacementString>` |
| `select` (string) param | `'<value \|\| UNSELECTED>'` |
| `select` (non-string) / `number` param | `<value>` |
| `boolean` param | `<value \|\| FALSE>` |
| `text` param | `'<value \|\| UNSELECTED>'` |

(Dynamically generated R fragments use `__DOUBLE_UNDERSCORE__` markers.) The 4-input-type substitution block is **duplicated** across the three generators, and the default/HFA generators wrap values in single quotes **without escaping** — see enforcement.

### Execution (`server/worker_routines/run_module/run_module_iterator.ts`)

An `async function*` yielding `RunStreamMsg` (`starting` / `r-output` / `r-error` / `download-file` / `upload-file` / `good-close` / `bad-close`). Errors become a `bad-close` **yield**, not a throw — the consumer (`run_module/worker.ts`) breaks the `for await` on a close message and posts the `task_ended` result accordingly.

Sandbox lifecycle, in order:
1. `checkSpaceForModuleRun()` — disk-space guard (may trigger a volume resize).
2. `emptyDir(sandbox/<project>/<module>)` and `DROP TABLE IF EXISTS ro_<resultsObjectId>` for each results object.
3. open the log file (`_MODULE_LOG_FILE_NAME`), write `getScriptWithParameters(...)` to `_MODULE_SCRIPT_FILE_NAME`, copy each `assetsToImport` from `_ASSETS_DIR_PATH`.
4. spawn R — **prod:** `docker run -it --rm --name fastr-run-<moduleId>-<runToken> -v <external sandbox>:/home/docker -w /home/docker/<moduleId> <image> Rscript <script>`; **dev:** `Rscript <script>` with `cwd` = external sandbox. Image: `timroberton/comb:wb-hmis-r-linux` (prod) / `…-r-local` (dev). The name (single source: `container_name.ts`) is what lets the host `docker rm -f` the container when it terminates a run — killing the docker CLI client alone doesn't stop the container.
5. merge `stdout`→`r-output` / `stderr`→`r-error` (strip VT control chars), write to log, yield each (the worker forwards to clients via `notifyProjectRScript` → SSE).
6. await exit, then **`sleep(2000)`** — R may still be flushing CSVs (longer under Docker) before they can be `COPY`-ed.
7. verify every declared results CSV exists (`throw` → `bad-close` if missing).
8. `storeResultsObject` each.

### Results ingestion (`storeResultsObject`)

For each results object: read CSV headers (first 16 KB, Papa.parse), build a `CREATE TABLE ro_<uuid>` from `getCreateTableStatementFromCsvHeaders` — which maps each CSV header to its definition column type and **throws if a header isn't declared** in `createTableStatementPossibleColumns`. Then in one `projectDb.begin`:

```sql
CREATE TABLE ro_<uuid> ( <declared columns> );
COPY ro_<uuid> FROM '<path-inside-postgres>' ENCODING 'UTF8' CSV HEADER NULL 'NA';
ALTER TABLE ro_<uuid> DROP COLUMN IF EXISTS <period helper + optional facility columns>;
```

Helper columns dropped depend on which period column the CSV has (`period_id` present → drop `month/quarter_id/year`; else `quarter_id` present → drop `month/year`; else drop `month/quarter_id`) — see [DOC_period_column_handling.md](DOC_period_column_handling.md). All three statements use `sql.unsafe`.

### The three path namespaces ⚠️

Because R runs in a container (prod) but Postgres `COPY` reads from *its own* container's filesystem, there are three views of the sandbox path:

| Env | Whose view | Used for |
|-----|-----------|----------|
| `_SANDBOX_DIR_PATH` | the Deno server process | reading/writing script, log, CSVs |
| `_SANDBOX_DIR_PATH_EXTERNAL` | the host (docker `-v` mount source) | the R container's volume mount |
| `_SANDBOX_DIR_PATH_POSTGRES_INTERNAL` | the Postgres container | the `COPY FROM '<path>'` literal |

Getting these crossed silently breaks either R execution or the `COPY`.

---

## Rules

1. **Load through `fetchModuleFiles` / `getModuleDefinitionDetail`** — never read module files ad hoc. Keep loading side-effect-free.
2. **Validate authored definitions with `moduleDefinitionGithubSchema`** and let it throw with paths; don't normalize invalid input.
3. **Add parameter markers via the generator**, and keep the three generators' substitution logic in sync (ideally factor it — see enforcement).
4. **Escape/validate any value interpolated into R source.** These strings execute as real R in a container.
5. **Only declared columns reach the DB.** Keep the "CSV header must be in the definition" invariant; don't relax it.
6. **Keep prod and dev branches equivalent** — a change to the Docker path must have a matching `Rscript` change.

---

## What NOT to do

- **Don't interpolate config values into R with bare single-quote wrapping.** The default and HFA generators do `'<value>'` with no escaping for `text`/`select`/`number` values and `COUNTRY_ISO3`; only the calculated-indicators generator validates identifiers (`assertValid*`). A value with a quote/newline can break or inject R. Validate-by-type or escape.
- **Don't remove the `2000ms` post-run sleep** without a real replacement — it exists because R/Docker hasn't necessarily flushed the CSVs when the process exits, and `COPY` would read a partial/absent file.
- **Don't confuse the sandbox path namespaces** (`_SANDBOX_DIR_PATH` vs `…_EXTERNAL` vs `…_POSTGRES_INTERNAL`).
- **Don't `throw` for an expected run failure** inside the iterator — `yield` a `bad-close` so the worker reports it cleanly.

---

## Gotchas

- **`loc-<rand>` gitRef in dev** means dev always reports an available update — that's intentional, not a bug.
- **The 2000ms flush is load-bearing and Docker-sensitive** — longer flush time in Docker is the documented reason.
- **`stripFrontmatter`** removes authored frontmatter from `script.R` before it's stored/run.
- **`-it` on `docker run` is required** so the command blocks until R finishes (per the inline comment) — removing it breaks the await.
- **Snapshot dependency.** HFA/calculated-indicators runs read project-level *snapshots* (written at data-export time), not live indicator tables, so defs and data stay consistent for the run. An empty snapshot is a hard, user-facing error.

---

## Enforcement opportunities

- **Injection-harden R-source interpolation:** route every interpolated value through a validator or type-specific escaper across all three generators (the calculated-indicators path already validates identifiers; default + HFA don't).
- **Factor the triplicated 4-input-type substitution block** into one shared function so quoting/escaping/fallbacks can't drift.
- **State the results-ingestion invariant** (only declared columns) and the path-construction contract (since `CREATE`/`COPY` use `sql.unsafe`).
- **Document the prod/dev equivalence contract:** what must stay identical across docker/`Rscript` and github/local, and which differences are intentional.
- **Record the 2000ms flush sleep** as a known constraint so it isn't silently removed/tuned.

---

## Adding/changing module execution — checklist

- [ ] Definition changes validate against `moduleDefinitionGithubSchema` (update the schema if the shape changes — [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md))
- [ ] New parameter marker handled in the relevant generator, with value escaping/validation
- [ ] New results object's columns declared in `createTableStatementPossibleColumns` (CSV headers must match)
- [ ] Both the Docker (prod) and `Rscript` (dev) paths updated equivalently
- [ ] Sandbox path references use the correct namespace for the consumer (Deno / host / Postgres)
- [ ] Failures `yield` `bad-close`; success `yield`s `good-close`

---

## Key files

| File | Purpose |
|------|---------|
| `server/module_loader/load_module.ts` | fetch + validate + translate (github/local), gitRef pinning |
| `server/module_loader/translation_utils.ts` | `getTranslateFunc` |
| `server/server_only_funcs/get_script_with_parameters.ts` | generator dispatch + default substitution |
| `server/server_only_funcs/get_script_with_parameters_{hfa,calculated_indicators}.ts` | specialized generators |
| `server/worker_routines/run_module/run_module_iterator.ts` | sandbox lifecycle, R execution, results ingestion |
| `server/worker_routines/run_module/worker.ts` | consumes the iterator, posts `task_ended` |
| `server/utils/disk_space.ts` | `checkSpaceForModuleRun` |
| `server/exposed_env_vars.ts` | sandbox path namespaces, image/file-name constants |
