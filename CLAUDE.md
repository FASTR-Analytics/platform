# WB FASTR - Project Documentation

## Overview

FASTR (Frequent Assessments and System Tools for Resilience) Analytics Platform
for processing, visualizing, and analyzing health data. A full-stack web
application with modular R-based data processing pipelines.

## Technology Stack

**Server**

- Runtime: Deno
- Framework: Hono (lightweight web framework)
- Database: PostgreSQL (multi-database architecture)
- Authentication: Clerk
- AI: Anthropic Claude
- Background Processing: Web Workers (progress polled by the client; SSE
  carries lifecycle + cache notifications)

**Client**

- Framework: SolidJS (client-side SPA)
- Build Tool: Vite
- Routing: @solidjs/router
- Styling: TailwindCSS v4
- State: IndexedDB via idb-keyval
- File Upload: Uppy (TUS protocol)
- Export: jsPDF, pptxgenjs, docx

**Shared**

- Language: TypeScript (strict mode)
- Visualization: Custom Canvas API + external panther library

## Architecture

The canonical topology is [SYSTEMS.md](SYSTEMS.md) — 17 systems, each with
its own `SYSTEM_NN_*.md` (verified prose + lint-enforced file manifest). The
tree below is orientation only.

### Monorepo Structure

```
wb-fastr/
├── client/                    # SolidJS SPA
│   ├── src/
│   │   ├── components/        # UI components by feature
│   │   ├── routes/            # Router configuration
│   │   ├── state/             # State management & caching
│   │   ├── server_actions/    # API client functions
│   │   ├── generate_*/        # Figure/slide/viz generation
│   │   └── exports/           # PDF/PPTX/XLSX/DOCX export logic
│   └── package.json
├── server/                    # Hono backend
│   ├── routes/                # API endpoints
│   │   ├── instance/          # Instance-level routes
│   │   └── products/          # Product (deck/report) routes
│   ├── db/                    # Database schemas & access
│   │   ├── instance/          # Main database tables + base schema
│   │   ├── products/          # Products registry + per-type detail tables
│   │   └── migrations/        # Migration runner (.sql + .ts)
│   ├── middleware/            # Auth, CORS, cache, static
│   ├── task_management/       # SSE notify hub + instance state builder
│   ├── worker_routines/       # Background job processors
│   ├── runs/                  # Results packages: format, capture, pin, delete
│   ├── run_query/             # DuckDB read path over a package
│   ├── dhis2/                 # DHIS2 integration
│   ├── github/ + module_loader/  # Module fetch + validation
│   └── server_only_funcs_presentation_objects/  # Viz query engine
├── lib/                       # Shared types & utilities
│   ├── types/                 # Shared TypeScript types
│   └── translate/             # i18n system (EN/FR, PT in rollout)
├── panther/                   # External UI/viz library (DO NOT MODIFY)
└── _example_instance_dir/     # Instance data (git-ignored)
    ├── databases/             # PostgreSQL data files
    ├── sandbox/               # Results packages + module execution workspace
    ├── valkey/                # Valkey data
    └── assets/                # Uploaded files
```

### One Database (`main`)

Everything Postgres holds is in one database per instance (see
[SYSTEM_02_persistence.md](SYSTEM_02_persistence.md)):

- User management and instance configuration
- Shared structural data (indicators, facilities, admin areas)
- Datasets, upload attempts, import runs and versions
- The `runs` catalogue (results packages) and the pin
- The **products registry** — `products` (slide decks and reports, one id
  namespace) plus `folders`, `slide_decks`/`slides`, `reports`, and the two
  version tables

**Results themselves are never in Postgres.** A results package is an immutable
directory on the runs volume (parquet + manifest), and every figure read runs
DuckDB over it.

### Data Processing Pipeline

1. **Import**: CSV/DHIS2 upload → multi-step validation → staging → integration
2. **Capture + compute**: the generation wizard captures the full datasets into
   a run workspace → R scripts in Docker containers → parquet + manifest →
   an immutable results package
3. **Authoring**: a product points at one package + one scope; figures are
   `{ metricId, config }` resolved under that pair and stored as FigureBundles
4. **Reporting**: decks and reports → PDF/PPT/XLSX/DOCX export
5. **AI Analysis**: Optional Claude interpretation of charts/data

### Module System

**Module Definitions**

- Authored in the separate `wb-fastr-modules` repo (R scripts + metadata;
  `deno task build` there regenerates each `definition.json`)
- Fetched from GitHub and validated at generation time via `server/github/` +
  `server/module_loader/` (see
  [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md))
- **Nothing is "installed"**: a module is compiled into a package at generation,
  and its status is the package manifest's availability stamp

**Execution Flow**

1. An admin configures a generation in the wizard and launches it
2. The `generate_run` worker prepares inputs, resolves the module DAG, and runs
   each module in a Docker container
3. Finalize writes parquet + `manifest.json`; the run dir is renamed atomically
4. The catalogue row flips to `ready` and the instance SSE nonce fires
5. Products point at the package from their own package picker

### Key Features

**Dataset Management**

- HMIS (Health Management Information System) datasets
- HFA (Health Facility Assessment) datasets
- Multi-step upload with validation
- Version control and comparison
- DHIS2 integration

**Products**

- Slide decks and reports, in folders, on one Drive-like page
- Each carries one `(results package, admin area 2)` scope
- Figures (charts, maps, tables) authored in place from the package's presets
  or the metric wizard, and stale-badged per figure when the pair moves
- The Explore tab browses a package's presets standalone

**Access Control**

- Signed in + approved = full editor of every product (`requireApprovedUser()`)
- Six instance permission flags for users, logs, settings and the data /
  results-package plane
- Clerk authentication
- Optional open access mode

**Internationalization**

- English/French UI (Portuguese in rollout)
- Inline `{ en, fr, pt? }` literals resolved via `t3()` — no translation build step
- Calendar support (Gregorian/Ethiopian)

**Real-time Updates**

- ONE instance Server-Sent Events channel: per-row product upserts, folders,
  slide stamps, generation telemetry, cache invalidation (import progress is
  polled by the client)
- ONE instance collaboration WebSocket for live co-editing
- Background worker coordination

## State Management

- [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md) — the T1–T5 tier model,
  app-specific read/write rules, and state/cache inventories (base construction
  rules: `panther/protocols/PROTOCOL_UI_STATE.md` + `PROTOCOL_UI_SOLIDJS.md`)
- [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) — server-side push
  system, notify catalog, connection lifecycle, Valkey + client cache machinery

## API Routes

**Instance Routes** (`lib/api-routes/instance/`, `server/routes/instance/`)

- `/instance/*` - Instance config, settings, AI context
- `/users/*` - Users and their six permission flags
- `/structure/*` - Admin areas, facilities, indicators
- `/datasets/*` - Dataset upload and management
- `/upload/*` - TUS file upload endpoints
- `/assets/*` - Static file serving
- `/run_generation/*` - Results packages: catalogue, generation, the pin,
  package internals, and the run-keyed figure-data reads + authoring context
- `/instance_updates` - the SSE stream · `/collab` - the collaboration WebSocket
- `/ai`, `/ai-instance` - Anthropic proxies · `/mcp` - the remote MCP endpoint

**Product Routes** (`lib/api-routes/products/`, `server/routes/products/`)

- `/products/*` - shared cross-type routes: create, label, folder, package,
  scope, duplicate, delete (batch)
- `/folders/*` - folder CRUD
- `/slide-decks/*`, `/slides/*`, `/reports/*` - per-type CONTENT and versions

**Cache Routes**

- `/caches/*` - Cache instances (not routes; see the S9 open item)

## Development

### Setup

```bash
# Install client dependencies
cd client && npm install && cd ..

# Create instance directory (if not exists)
mkdir -p _example_instance_dir/{databases,sandbox,assets,valkey}

# Configure environment
cp .env.example .env
# Edit .env with your Clerk/Postgres/Anthropic credentials

# Configure client environment
cd client
cp .env.example .env.development.local
cp .env.example .env.production.local
# Edit with Clerk publishable key
cd ..
```

### Running

**Single command** (both server + client):

```bash
./run
```

**Separate terminals**:

```bash
# Terminal 1: Server
deno task dev

# Terminal 2: Client
cd client && npm run dev
```

Server: `http://localhost:8000` Client: `http://localhost:3000`

### Build Tasks

```bash
deno task build:help-buttons  # Regenerate help-button lookup table
deno task build:client        # Build client SPA
deno task typecheck           # Check both server + client (+ lint:systems)
```

## Deployment

```bash
./deploy
```

Workflow:

1. Typecheck gate (`deno task typecheck`, includes `lint:systems`)
2. Version bump (major/minor/patch)
3. Client build (optional)
4. Docker image build and push
5. Git commit and push

Docker image: `timroberton/comb:wb-fastr-server-v{version}`

## Protocol Docs (`DOC_*.md`)

Prescriptive protocols for how this app is built (distinct from the
`panther/protocols/` library protocols). Read the relevant one before working in
that area.

### Working method

- [PROTOCOL_APP_DEVELOPMENT.md](PROTOCOL_APP_DEVELOPMENT.md) — the
  verification loop, built MCP-first: the Clerk-OAuth end-to-end chain, the
  rungs below it and which link each one skips (execute locally → local `/mcp`
  → `./deploy_testing` → read-only DB), the JSON-RPC probe recipe, and the
  standing checks for any MCP change

### Server / architecture

- [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md) — registry-as-contract,
  `defineRoute`, `APIResponse` envelope, streaming sub-protocol, Clerk, the two
  guards, the **path-id-is-the-authority doctrine**, special modes
  ([PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md) is the add-a-route recipe)
- [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) — connections,
  DB-function shape, error funnel, **SQL-safety rule**, the SQL + TypeScript
  migration chain, fail-stop boot
- [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) —
  BroadcastChannel→SSE, notify catalog, the `last_updated → SSE → cache`
  triangle, `TimCacheC` version-hash keying + implicit invalidation
- [SYSTEM_05_facilities_indicators.md](SYSTEM_05_facilities_indicators.md) —
  facilities/admin structure ELT, indicator dictionaries, geojson, time points,
  instance config
- [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) — stage→integrate ingestion
  (HMIS/HFA/ICEH dataset families)
- [SYSTEM_07_dhis2.md](SYSTEM_07_dhis2.md) — DHIS2 API client: base fetcher,
  retry, goals, connection validation, session caches
- [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md) — results
  packages & module execution: **the authoritative run-directory + manifest
  format spec**, the wizard-configured whole-DAG generation pipeline, R
  execution, the package catalogue, the pin, population.csv
  ([PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) is the
  write-a-worker recipe)
- [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) — AI copilot: Anthropic
  proxies + token-limit governance, browser tools via panther's view
  registry/controller contract,
  tool schemas ([PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) is the
  schema-authoring recipe)
- [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) — figure query &
  cache: config → SQL (CTEManager, roll-up row, post-aggregation),
  period/disaggregation semantics, AA2 scope injection, the
  `(runId, scopeToken)` caches
  ([PROTOCOL_APP_QUERY_RIG.md](PROTOCOL_APP_QUERY_RIG.md) is the add-a-case
  recipe for `./validate_queries`)
- [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — SQL migrations +
  JSON data transforms + validation boundaries

### Data / domain

- Module updates and the population.csv format are in
  [SYSTEM_08_results_packages.md](SYSTEM_08_results_packages.md); period columns,
  disaggregation options, and roll-up rows are in
  [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md)

### Client / UI

- [PROTOCOL_APP_UI_CONVENTIONS.md](PROTOCOL_APP_UI_CONVENTIONS.md),
  [SYSTEM_10_figure_render_export.md](SYSTEM_10_figure_render_export.md) (FigureBundle, special chart modes),
  [SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md) (shell, translation, help buttons),
  [PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md),
  [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md)

### Cross-project base (`panther/protocols/`)

The `DOC_*.md` files above are app-specific. The cross-project conventions they
build on live in `panther/protocols/` (synced from the panther repo — do not
edit here):

- `PROTOCOL_ALL_*` — universal: TypeScript/code-quality, structure, sizing,
  translation
- `PROTOCOL_UI_*` — frontend: SolidJS, state, styling, components,
  **`PROTOCOL_UI_STRUCTURE`** (client file organisation — components mirror the
  UI, `_shared/` home, co-location), and **`PROTOCOL_UI_AI_CHAT`** (AI chat
  surfaces: views, tools, gating, interactions, approval, prompts)
- `PROTOCOL_DENO_API` — backend route/validation patterns

When a base convention is wrong or missing, fix it in the panther source and
re-sync — never edit `panther/` directly.

## Important Notes

### External Libraries

- `panther/` is an external library - **NEVER** modify files in this directory
- It provides UI components and visualization utilities
- Maintained separately with own licensing

#### Importing panther (and how `lib/` reaches it)

`panther/` ships two entry barrels: `mod.deno.ts` (server/Deno) and `mod.ui.ts`
(client/SolidJS). Both re-export the universal `_000_utils/` (string/number
helpers, `t3`, etc.); `mod.ui.ts` additionally exports the SolidJS/Canvas UI
surface.

Two import specifiers resolve to those barrels, per runtime:

- **`@timroberton/panther`** — the runtime-agnostic specifier. Use this in
  `lib/` and `server/`.
  - Deno resolves it via `deno.json` → `imports` → `./panther/mod.deno.ts`.
  - The client resolves the _same_ specifier (it appears in lib code the client
    bundles) via `client/tsconfig.json` `paths` **and** `client/vite.config.ts`
    `alias` → `../panther/mod.ui.ts`.
- **`"panther"`** — client-only shorthand, mapped to `mod.ui.ts` in
  `client/tsconfig.json`. Use it in `client/` code for the UI surface.

So `lib/` _can_ and _does_ import panther — always through
`@timroberton/panther`, never the bare `"panther"`. Because `lib/` is compiled
into **both** the Deno server and the Vite client, anything `lib/` imports from
panther must exist in **both** barrels — i.e. only the shared `_000_utils`-level
exports (e.g. `capitalizeFirstLetter`, `getAdjustedColor`), not UI-only exports.
UI-only symbols belong in `client/` code.

### Code Style

- **Prefer editing existing files** over creating new ones
- **No unnecessary comments** - code should be self-documenting
- **Strict TypeScript typing** - avoid `any`
- Follow existing patterns and conventions
- Use functional programming where appropriate
- **Never create a `scripts/` folder** - put build/utility scripts at the repo
  root

### User testing is NOT project work (ruled 2026-08-07, emphatic)

Tim continually uses the app in dev and production. That usage IS the
browser/runtime verification, it is HIS responsibility, and it NEVER counts
as project work. Never list his verification in a plan, a todo, or a
"remaining" line; never treat it as a blocker for closing work or deleting a
plan file. The only exception is a specific manual check that has been
EXPLICITLY AGREED as a gate. When implementation and the automated gates
(typecheck, harnesses, rigs) are green, the work is done — close and delete
the plan.

### Cross-Cutting Changes & Refactors (hard-won rules)

- **Three repos move together.** Features often span this app, the authored
  modules (`wb-fastr-modules` — edit `_metrics/*.ts` etc., then
  `deno task
  build` regenerates `definition.json`; push it in lockstep with
  schema changes), and panther. `./sync` (run from the panther repo) copies
  panther's **working tree** wholesale — confirm panther typechecks before
  syncing, and stage/commit app changes FIRST so the sync diff stays isolated.
- **Renaming or deleting a stored JSON field is never just a rename.** Zod strip
  mode treats the old key as valid AND silently drops it on every read, so the
  user's setting vanishes with no error. Required in lockstep: a transform
  block, a forced skip-gate (PROTOCOL_APP_MIGRATIONS.md "Skip-Gate Gotcha"), and
  the authored `definition.json` files when the github schema changes.
- **Changing a cached payload's SHAPE needs an explicit version/prefix bump.**
  A cache key never tracks code — a deploy that adds a field keeps serving
  old-shape payloads. Server-side the knob is `PO_CACHE_VERSION`
  (SYSTEM_03/SYSTEM_09); client-side it is the `createReactiveCache` `name`
  (e.g. the run authoring context, versioned on a constant). When a shape
  changes, enumerate all three persistence layers: DB JSON (migration), Valkey
  (`PO_CACHE_VERSION`), stored FigureBundles (force block in the slide_config /
  reports sweeps).
- **Keep display-only preferences out of fetch configs and cache hashes.** A
  render knob in the data layer means spurious refetches and gets frozen into
  stored figure snapshots (the roll-up position/two-sentinel lesson —
  SYSTEM_09_viz_query_cache.md).
- **Never mutate an unwrapped Solid store object.** No subscribers fire, and the
  setter's equality guard turns the user's next identical write into a silent
  no-op. When fixing such a mutation by switching to a copy, grep EVERY consumer
  first — callers may depend on the aliasing.
- **One authoritative doc comment per contract**, single-line pointers
  everywhere else. Restated contracts drift (one gate accumulated eight copies,
  five of them wrong).
- **Verify by executing, not by reading.** lib/server functions run directly:
  `deno run --allow-all -c deno.json /tmp/check.ts` with absolute-path imports.
  A ten-line harness settles SQL/gate/normalization questions decisively.
- **Expect parallel workstreams in the working tree.** Before staging,
  committing, or debugging typecheck errors, check `git status` for files
  outside your scope — concurrent work is normal here, and its errors are not
  yours to fix without asking.

### Database Migrations

- One directory: `/server/db/migrations/instance/`, `.sql` and `.ts` sorted
  together. A `.ts` migration MUST be registered in `TS_MIGRATIONS`
  (`migrations/runner.ts`) or the runner throws.
- Auto-run at startup via `db_startup.ts`, one pass on `main`, fail-stop.

### Worker Routines

Background processors for:

- `generate_run/` - whole-DAG results-package generation (R in Docker)
- `import_hmis_data_csv/` - HMIS CSV stage → gate → integrate
- `import_hmis_data_dhis2/` - DHIS2 HMIS imports, incl. the scheduled tick
- `import_hfa_data_csv/` - HFA CSV + XLSForm import
- `import_iceh_data/` - ICEH zip import

Each uses Web Workers for non-blocking execution; the client polls status
routes for import progress, and SSE signals lifecycle/cache events and
generation telemetry.

### Route Registry

All routes must be registered in `route-tracker.ts` to ensure proper typing and
validation.

### Environment Variables

Key variables (see `.env.example`):

- `CLERK_SECRET_KEY` - Authentication
- `PG_PASSWORD` - PostgreSQL connection
- `ANTHROPIC_API_KEY` - AI features
- `SANDBOX_DIR_PATH` - Module execution workspace
- `ASSETS_DIR_PATH` - File uploads
- `ISO_COUNTRY_CODE` - REQUIRED: the instance's country, an ISO3 code or
  `SOMALILAND`; boot fail-stops without it
- `INSTANCE_LANGUAGE` - Default language (en/fr)
- `INSTANCE_CALENDAR` - Calendar type (gregorian/ethiopian)
- `INSTANCE_FISCAL_YEAR` - Fiscal-year reporting (none/july, default none;
  relabels quarterly timeseries axes; gregorian only)

## License

Proprietary - The World Bank, GFF, FASTR Initiative (2025)

Third-party code in `panther/` has separate licensing - see
`panther/LICENSE.txt`
