# WB FASTR

FASTR Analytics Platform: a Deno/Hono server and SolidJS client that ingests
health facility data and runs versioned R analysis modules into immutable
results packages. It renders visualizations, slide decks, reports, and
dashboards from those packages. One instance per country.

## Read first

- [SYSTEMS.md](SYSTEMS.md) is the map: 17 systems plus a kernel of shared
  files no system owns. Each system has its own `SYSTEM_NN_*.md` holding
  verified prose and a lint-enforced file manifest. Read the SYSTEM file for
  the area you touch before changing it.
- `PROTOCOL_APP_*.md` are recipes, one per task: routes, workers, migrations,
  AI tool schemas, query-rig cases, client state, UI conventions, help
  buttons, and the verification loop
  ([PROTOCOL_APP_DEVELOPMENT.md](PROTOCOL_APP_DEVELOPMENT.md)).
- `panther/protocols/` holds the cross-project conventions those build on.
- `PLAN_*.md` files are open work.
- Setup is in [README.md](README.md), tasks in `deno.json`, and every
  environment variable in `.env.example`.

## Gates

- `deno task typecheck` runs the server check, the client check, and
  `lint:systems`. The lint fails if any tracked `.ts` or `.tsx` file under
  `server/`, `lib/`, or `client/src/` is not claimed by exactly one SYSTEM
  file's file-pattern (`globs`) manifest. Adding or moving a file means
  editing a manifest.
- Migrations use idempotent schema SQL and must pass `./validate_migrations`. A hook
  in `.claude/settings.json` reminds you when you touch one.
- Query-engine changes must pass `./validate_queries`.
- `./validate_protocols` checks the client against the SolidJS and state
  protocols. Entries in its baseline file are reviewed and accepted
  exceptions. Do not rewrite them to clear the list without a ruling.
- Read the code, then prove the change by running it. A ten-line harness
  settles SQL, gate, and normalisation questions:
  `deno run --allow-all -c deno.json /tmp/check.ts` with absolute-path imports.
- Tim's own use of the app in dev and production is the browser verification.
  It is his responsibility and never appears in a plan, a todo, or a
  "remaining" line. When the automated gates are green, the work is done:
  delete the plan file in the same commit.

## Boundaries

- `panther/` is a synced copy of an external library. Never edit it here. Fix
  the source in the panther repo, then re-sync with its `./sync`, which copies
  the working tree wholesale. Confirm panther typechecks first, and commit app
  changes before syncing, so the sync diff stays isolated.
- `lib/` compiles into both the Deno server and the Vite client. It may import
  from panther only through `@timroberton/panther`, and only the shared
  `_000_utils`-level exports that exist in both entry files (`mod.deno.ts` and
  `mod.ui.ts`). UI-only symbols belong in `client/`, which imports the bare
  `"panther"` specifier.
- Three repos move together: this app, `wb-fastr-modules` (edit the metric
  sources, `deno task build` regenerates each `definition.json`, push in
  lockstep with schema changes), and panther.
- Generated files are regenerated, never hand-edited:
  `lib/help/help_targets.generated.ts` comes from
  `deno task build:help-buttons`.

## Local development differs from production

- Module definitions load from the local `wb-fastr-modules` checkout via
  `FASTR_MODULES_LOCAL_DIR`. Production fetches them from GitHub.
- R runs on the host with `Rscript`. Production runs it in the Docker image
  recorded in each run's manifest.
- The Valkey cache must be running. The server retries a missing Valkey
  forever instead of booting. `./run` starts it for you.
- `./deploy_testing` is the non-interactive deploy to the testing instance,
  safe for AI use. `./deploy` is the release path.
- Production databases are reachable read-only per `PROTOCOL_ACCESS_DBS.md`
  (git-ignored, local only).

## Lockstep rules

- **Renaming or deleting a stored JSON field changes more than the key
  name.** Zod, the schema library, strips unknown keys by default, so it
  treats the old key as valid and silently drops it on every read. The
  setting vanishes with no error. Required together: a transform block,
  a forced skip-gate (the "Skip-Gate Gotcha" in
  [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md)), and the authored
  `definition.json` files when the GitHub schema changes.
- **Changing a cached payload's shape needs a cache-prefix bump.** Valkey
  version hashes track row `last_updated`, not code, so a deploy that adds a
  field keeps serving old-shape payloads for unmodified rows. Enumerate all
  three persistence layers: DB JSON (migration), Valkey (prefix), and stored
  FigureInputs (force block in the slide_config sweep).
- **Keep display-only preferences out of fetch configs and cache hashes.** A
  display-only setting in the data layer causes unnecessary refetches and
  gets frozen into stored figure snapshots.
- **Never mutate an unwrapped Solid store object.** No subscribers fire, and
  the setter's equality guard turns the next identical write into a silent
  no-op. When fixing one by switching to a copy, grep every consumer first,
  because callers may depend on the aliasing.
- **One authoritative doc comment per contract**, single-line pointers
  everywhere else. Restated contracts drift.

## Working in this repo

- Expect parallel workstreams in the working tree. Check `git status` before
  staging or committing. Typecheck errors in files outside your scope are not
  yours to fix without asking.
- Build and utility scripts live at the repo root. No `scripts/` directory
  anywhere except `.github/scripts/` for continuous integration.
- Em-dashes are gone from docs, comments, and scripts. String literals shown
  to users or written to logs keep theirs. Do not remove those.
