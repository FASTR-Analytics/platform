# PLAN: Transition panther from synced copies to a private submodule

## Status

- 2026-07-13: Concept proven end-to-end on panther-test (Phase 0 complete).
- Everything else: not started.

## Motivation

Panther source is fully exposed in the public `FASTR-Analytics/platform` repo
(7MB, all modules, entire git history). Mitigations already in place: every
synced file carries an "All rights reserved" header + LICENSE.txt (visibility
grants no usage rights), and the Docker Hub image (`timroberton/comb`) is
private. Goal: stop shipping panther source into public repos while keeping
(a) the colleague workflow zero-knowledge about panther build/sync, (b) raw TS
files on disk for intellisense/build, (c) the low-friction dev-sync cycle with
no version-publish ceremony.

## Chosen design

One **private** GitHub repo, `timroberton/panther-dist`, containing exactly
what a `both`-mode sync produces (modules `_0*`–`_3*`, both barrels,
`deno.json`, licenses, `protocols/`, `.panther-manifest.json`). Each app
replaces its synced `panther/` directory with a submodule pinned to a
`panther-dist` commit.

- Every dist commit is implicitly a version — no semver, no registry, no
  publish ceremony. Apps pin independent commits (same drift model as today's
  per-app copies).
- ui-only and deno-only apps mount the same full dist; the extra files are
  inert (verified on panther-test: tsc never enters the excluded dir, vite
  bundles only what `mod.ui.ts` reaches).
- App configs (tsconfig paths, vite alias, deno.json workspace/import map,
  Dockerfile COPY) need **zero changes** — files exist at the same paths.

## Phase 0 — proof on panther-test (DONE 2026-07-13)

- Created `timroberton/panther-dist` (PRIVATE), seeded from clean panther
  `28ae12c` via the real sync CLI (all gates passed), snapshot commit
  `0f6bcdb`.
- panther-test `b05cc44`: `git rm -r src/panther` + submodule add, zero config
  changes.
- Verified: vite build passes; typecheck error count identical pre/post swap
  (8 pre-existing `_305_ai` vs `@anthropic-ai/sdk ^0.71.0` drift errors,
  unrelated — fix separately with an SDK bump in panther-test); fresh
  `git clone --recursive` fetches the submodule from private GitHub.
- Known warts from the test:
  - Dist manifest says `pantherGitDirty: true` — artifact of a temporary
    sync-configs entry present at sync time; content is exactly clean
    `28ae12c`. First real re-sync in Phase 1 fixes it.
  - `git rm` leaves `.DS_Store` cruft behind; `rm -rf` the dir before
    `git submodule add`.
  - The chmod 444 read-only bit does not survive git; clones get writable
    files. The DO-NOT-EDIT header remains, and edits show as a dirty
    submodule in `git status`.

## Phase 1 — sync CLI: dist-repo target

The blocker for real adoption. `syncTarget` empties and atomically swaps the
target directory — pointed at a repo root it would destroy `.git`. (Phase 0
worked around this: `--force --no-commit` into a fresh dir, `git init` after.)

1. Add a dist target kind to the CLI (e.g. `"dist": true` on a target in
   `sync-configs.json`): build into staging as today, then replace the repo
   root's contents while preserving `.git`, then `git add -A` + commit +
   push. Keep the existing pre-sync gates (fmt/typecheck/structure/lint/test)
   — they are what makes a dist commit trustworthy.
2. Add the permanent `panther-dist` entry pointing at a persistent local
   checkout (e.g. `/Users/timroberton/projects/panther/panther-dist`, mode
   `both`).
3. Optional, later: teach the CLI to bump submodule pointers in app repos
   (`git submodule update --remote` + commit), replacing today's per-app copy
   targets. Manual bumping is fine initially.
4. `--watch` for live iteration: point the watcher at an app's submodule
   checkout — it's plain files, so copying into it works as today; commit in
   dist when satisfied.
5. Run one real sync to `panther-dist` (also clears the dirty-flag wart).

New steady-state dev loop:
`./sync` → dist auto-commits + pushes → in each app when wanted:
`git submodule update --remote <panther path>` + commit the pointer bump.

## Phase 2 — wb-fastr (the repo that matters)

Decide the history question FIRST — a scrub and the conversion should share
one flag day (single recloning event for the colleague).

### 2a. History decision (pick one)

- **Leave history**: cheapest; defensible given the license headers. Panther
  stops appearing in new commits only.
- **Scrub**: `git filter-repo` dropping `panther/` from history, force-push,
  colleague reclones, GitHub support ticket to purge cached views/forks.
- **Make the repo private**: also solves history for free — only viable if
  public visibility isn't a requirement.

### 2b. Conversion

1. Clean working tree; coordinate a quiet moment with the colleague.
2. `git rm -r panther && rm -rf panther`.
3. `git submodule add https://github.com/timroberton/panther-dist.git panther`
   pinned to the current dist commit (or re-sync dist from the same panther
   commit wb-fastr last received, to make the swap content-identical).
4. No config changes expected: `deno.json` workspace + import map,
   `client/tsconfig.json` paths, `client/vite.config.ts` alias, Dockerfile
   `COPY panther` all resolve the same on-disk paths. Verify each anyway.
5. Verify: `deno task typecheck`, `./run` smoke, `./deploy` docker build
   (builds from local working tree, so the initialized submodule is just
   files — no registry auth needed in the image build).
6. Update docs that describe the copy model: CLAUDE.md ("synced from the
   panther repo — do not edit here" stays true; the sync-mechanics wording
   changes), and the Cross-Cutting Changes rule about staging app changes
   before sync (pointer bumps replace sync diffs).

### 2c. Colleague onboarding (one-time)

1. Grant GitHub read access to `timroberton/panther-dist`.
2. They run: `git submodule update --init` (or reclone `--recursive` if
   history was scrubbed) and `git config submodule.recurse true` — after
   which pulls are transparent.
3. If CI is ever added that builds the app: `actions/checkout` needs
   `submodules: true` plus a PAT/deploy key for the private submodule. The
   two current workflows (changelog, docs-sync) don't build and are
   unaffected.

## Phase 3 — remaining active apps

Convert incrementally, no flag day needed, same recipe as 2b (path varies:
some mount at repo root `panther/`, ui apps at `src/panther`):
panrunner, marker, summariser, timroberton-data, hs-modeling-new, pubh1101,
pubh5755, usefuldata-finances.

Per app: check for public remotes (same exposure question), verify
tsconfig/vite/deno wiring after swap, remove the app's copy target from
`sync-configs.json` once converted.

Locked configs (who-abortion, who-climate-change, ai-server) are frozen and
never re-synced — leave them on their existing copies unless/until unlocked.

## Phase 4 — cleanup

- `sync-configs.json` ends with the single dist target (plus locked
  legacy entries).
- Retire the per-app copy logic in the CLI if nothing uses it (or keep for
  locked-app emergencies).
- Delete this plan.

## Open decisions

1. History handling for `FASTR-Analytics/platform` (2a) — Tim to rule.
2. Whether the CLI auto-bumps app submodule pointers (Phase 1 step 3) or
   bumps stay manual.
