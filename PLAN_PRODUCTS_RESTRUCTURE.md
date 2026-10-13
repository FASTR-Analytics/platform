# PLAN: Products restructure deploy

Version 2 dissolves projects: products are slide decks and reports, kept in
nested folders, each attached to one results package at one scope, in one main
database. The code is done on `version2`. What remains is the deploy: the three
v2 testing instances, the fleet, then the purge of the legacy per-project
databases.

**Next step: Step 11.** Tim sets this line as each step finishes. Step 14
deletes the file.

## Steps

### Step 11: Deploy to the three v2 testing instances

1. `./validate_consolidation.ts nigeria-v2-testing guinee-v2-testing
   ghana-v2-testing`.
   Fix any FAIL. Read the REVIEW counts.
2. Deploy `version2` to the three.
3. Refine there: commit fixes to `version2` and redeploy. 201 runs once per
   instance, so redeploys skip it.

Until step 13, a migration added on `main` keeps its own numbering, below 200,
and so sorts before 200 to 202.

Done when the team and the client are happy with version 2.

### Step 12: Prepare the fleet deploy

1. Merge `main` into `version2`.
2. status-api tolerates the fields version 2 removes (External couplings,
   below).
3. `./validate_consolidation.ts --json` across the fleet. Fix every FAIL
   (usually: pin a package on the instance). Read the REVIEW counts.

### Step 13: Deploy to the fleet

1. Merge `version2` into `main`.
2. Deploy with `rollout_products`, which checks each instance's product and
   folder counts against step 12's `--json`.

### Step 14: Purge and close

Once no instance will be rolled back:

1. `purge_legacy_dbs` on each instance.
2. In one commit, delete `validate_consolidation.ts`,
   `validate_consolidation_replay`, `validate_consolidation_replay.ts`,
   `rollout_products`, `purge_legacy_dbs`, `restore_main` (unless kept), the doc
   lines that name them, and this file.

## Rollout and rollback

The rollout is steps 11 to 14. To roll back an instance before step 14, run
`restore_main` with its pre-deploy main dump and start the previous image; 201
leaves the project databases untouched.

## External couplings (named, not fetched; separate repos and services)

- **status-api / Status Central Portal**: `/health_check` loses `projects`;
  `/projects` and `/project_activity` are gone; `/user_logs*` and `/ai_usage`
  rows lose `project_id`; per-project backup files stop appearing (main dump
  only); rename-email fan-out result shape. Coordinate before the fleet deploy:
  their pollers must tolerate the missing fields.
- **Fleet MCP connector** ("FASTR Results", `get_my_projects` and the
  project-scoped dialect): this repo's `/mcp` is already the pinned dialect; no
  change expected, but the connector's project vocabulary is stale after this.
- **server-cli**: path-agnostic nginx WS-upgrade template (before deploy); later
  and separately, sandbox-to-runs sites.
- **wb-fastr-site (docs)**: 15 EN and 15 FR pages mention projects; two
  wholly-project pages; the dashboard and visualization pages; 4 images; help
  tags `aproj-*`, `uproj-*`, `users-project-permissions`. After the site
  rewrite: `deno task build:help-buttons`. Not blocking (one help button
  consumed).
- **panther**: no code coupling; example snippets in `PROTOCOL_DENO_API.md`
  (`Project-Id`) and `PROTOCOL_UI_AI_CHAT.md`
  (`getSharedToolsForMetrics(env,
  projectId, ...)`). Edit in panther, re-sync.
- **wb-fastr-modules**: no coupling (`PROJECT_DATA_HMIS` is an opaque token;
  `DOC_MODULES.md` prose stale; `createDefaultVisualizationOnInstall` keeps its
  name and now means "is a preset").
- **Clerk**: `unsafeMetadata.onboarding` tour keys re-fire once after the
  rename; nothing else.
- **Public dashboard URLs** already shared (`/d/<slug>`) stop working. No
  redirect is provided.
