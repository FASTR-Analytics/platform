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
- Background Processing: Web Workers with Server-Sent Events

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

### Monorepo Structure

```
wb-fastr/
├── client/                    # SolidJS SPA
│   ├── src/
│   │   ├── components/        # UI components by feature
│   │   ├── routes/            # Router configuration
│   │   ├── state/             # State management & caching
│   │   ├── server_actions/    # API client functions
│   │   ├── generate_*/        # Chart/report/viz generation
│   │   └── export_report/     # PDF export logic
│   └── package.json
├── server/                    # Hono backend
│   ├── routes/                # API endpoints
│   │   ├── instance/          # Instance-level routes
│   │   └── project/           # Project-level routes
│   ├── db/                    # Database schemas & access
│   │   ├── instance/          # Main database tables
│   │   ├── project/           # Per-project database tables
│   │   └── migrations/        # Migration runner
│   ├── middleware/            # Auth, CORS, cache, static
│   ├── task_management/       # Dependency tracking & execution
│   ├── worker_routines/       # Background job processors
│   ├── dhis2/                 # DHIS2 integration
│   └── visualization_definitions/
├── lib/                       # Shared types & utilities
│   ├── types/                 # Shared TypeScript types
│   └── translate/             # i18n system (EN/FR)
├── panther/                   # External UI/viz library (DO NOT MODIFY)
├── module_defs/               # Module definitions (source)
│   └── {module_id}/{version}/ # R scripts + metadata
├── module_defs_dist/          # Generated module definitions
└── _example_instance_dir/     # Instance data (git-ignored)
    ├── databases/             # PostgreSQL data files
    ├── sandbox/               # Temp files for module execution
    └── assets/                # Uploaded files
```

### Multi-Database System

**Main Database** (`main`)

- User management
- Instance configuration
- Project metadata
- Shared structural data (indicators, facilities, admin areas)
- Dataset upload attempts and versions

**Project Databases** (per-project, named by the bare project UUID, e.g.
`f47ac10b-...` — **not** `project_{uuid}`; see
[SYSTEM_02_persistence.md](SYSTEM_02_persistence.md))

- Project-specific data isolation
- Module instances and configurations
- Presentation objects (visualizations)
- Reports
- Results objects from module execution
- AI interpretations

### Data Processing Pipeline

1. **Import**: CSV/DHIS2 upload → multi-step validation → staging → integration
2. **Processing**: Module execution → R scripts in Docker containers → results
   storage
3. **Visualization**: Presentation objects → Canvas rendering
4. **Reporting**: Multi-viz reports → PDF/PPT/DOCX export
5. **AI Analysis**: Optional Claude interpretation of charts/data

### Module System

**Module Definitions** (`module_defs/`)

- Versioned R scripts with metadata
- Parameter configurations
- Data source requirements
- Results object schemas
- Built at startup via `build_module_definitions.ts`

**Module Instances**

- Per-project installations of module definitions
- User-configured parameters
- Dependency tracking
- Dirty state management (triggers re-execution)

**Execution Flow**

1. Task manager identifies dirty modules
2. Worker routine instantiated in background
3. R script executed in Docker container
4. Results stored in project database
5. SSE notification to client
6. Dependent modules marked dirty

### Key Features

**Dataset Management**

- HMIS (Health Management Information System) datasets
- HFA (Health Facility Assessment) datasets
- Multi-step upload with validation
- Version control and comparison
- DHIS2 integration

**Visualization**

- Presentation objects (charts, maps, tables)
- Dynamic querying with filters
- Period selection and disaggregation
- Custom Canvas-based rendering

**Access Control**

- Role-based: viewer/editor/admin
- Project-level isolation
- Clerk authentication
- Optional open access mode

**Internationalization**

- English/French UI (Portuguese in rollout)
- Inline `{ en, fr, pt? }` literals resolved via `t3()` — no translation build step
- Calendar support (Gregorian/Ethiopian)

**Real-time Updates**

- Server-Sent Events for task progress
- Background worker coordination
- Live dirty state synchronization

## State Management

- [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md) — the T1–T5 tier model,
  app-specific read/write rules, and state/cache inventories (base construction
  rules: `panther/protocols/PROTOCOL_UI_STATE.md` + `PROTOCOL_UI_SOLIDJS.md`)
- [SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md) — server-side push
  system, notify catalog, connection lifecycle, Valkey + client cache machinery

## API Routes

**Instance Routes** (cross-project)

- `/instance/*` - Instance config, user management
- `/users/*` - User roles and permissions
- `/structure/*` - Admin areas, facilities, indicators
- `/datasets/*` - Dataset upload and management
- `/upload/*` - TUS file upload endpoints
- `/assets/*` - Static file serving

**Project Routes** (project-specific)

- `/project/*` - Project metadata and settings
- `/modules/*` - Module installation and execution
- `/presentation_objects/*` - Visualization configs
- `/reports/*` - Report generation
- `/ai/*` - AI analysis

**Cache Routes**

- `/caches/*` - Cache invalidation endpoints

## Development

### Setup

```bash
# Install client dependencies
cd client && npm install && cd ..

# Create instance directory (if not exists)
mkdir -p _example_instance_dir/{databases,sandbox,assets}

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

### Server / architecture

- [SYSTEM_01_api_contract.md](SYSTEM_01_api_contract.md) — registry-as-contract,
  `defineRoute`, `APIResponse` envelope, streaming sub-protocol, Clerk, the two
  permission guards, `Project-Id` scoping, special modes
  ([PROTOCOL_APP_ROUTES.md](PROTOCOL_APP_ROUTES.md) is the add-a-route recipe)
- [SYSTEM_02_persistence.md](SYSTEM_02_persistence.md) — connections,
  DB-function shape, error funnel, **SQL-safety rule** (authoritative for the
  multi-DB naming/connection model), migration machinery + fail-stop boot,
  backup/restore mechanics
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
- [SYSTEM_08_module_system.md](SYSTEM_08_module_system.md) — module system
  end-to-end: load/install/update, dirty state machine + dependency propagation,
  `task_ended` loop, R execution + `ro_*` ingest, population.csv
  ([PROTOCOL_APP_WORKER_ROUTINES.md](PROTOCOL_APP_WORKER_ROUTINES.md) is the
  write-a-worker recipe)
- [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) — AI copilot: Anthropic
  proxies + token-limit governance, browser tools via the AIContext contract,
  tool schemas ([PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) is the
  schema-authoring recipe)
- [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) — viz query &
  cache: config → SQL (CTEManager, roll-up row, post-aggregation),
  period/disaggregation semantics, PO caches
- [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) — SQL migrations +
  JSON data transforms + validation boundaries

### Data / domain

- Module updates and the population.csv format are in
  [SYSTEM_08_module_system.md](SYSTEM_08_module_system.md); period columns,
  disaggregation options, and roll-up rows are in
  [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md)

### Client / UI

- [DOC_BUILD_INSTRUCTIONS.md](DOC_BUILD_INSTRUCTIONS.md),
  [DOC_DESIGN_SYSTEM.md](DOC_DESIGN_SYSTEM.md),
  [DOC_SPECIAL_CHART_MODES.md](DOC_SPECIAL_CHART_MODES.md),
  [SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md) (shell, translation, help buttons),
  [PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md),
  [PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md)

### Cross-project base (`panther/protocols/`)

The `DOC_*.md` files above are app-specific. The cross-project conventions they
build on live in `panther/protocols/` (synced from the panther repo — do not
edit here):

- `PROTOCOL_ALL_*` — universal: TypeScript/code-quality, structure, sizing,
  translation
- `PROTOCOL_UI_*` — frontend: SolidJS, state, styling, components, and
  **`PROTOCOL_UI_STRUCTURE`** (client file organisation — components mirror the
  UI, `_shared/` home, co-location)
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
- **Changing a cached payload's SHAPE needs a cache-prefix bump.** Valkey
  version hashes track row `last_updated`, not code — a deploy that adds a field
  keeps serving old-shape payloads for unmodified rows (e.g. `po_detail` →
  `po_detail_v2`). When a shape changes, enumerate all three persistence layers:
  DB JSON (migration), Valkey (prefix), stored FigureInputs (force block in the
  slide_config sweep).
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

- Instance migrations: `/server/db/migrations/instance/`
- Project migrations: `/server/db/migrations/project/`
- Auto-run at startup via `db_startup.ts`

### Worker Routines

Background processors for:

- `run_module/` - R script execution in Docker
- `integrate_hmis_data/` - HMIS data integration
- `integrate_hfa_data/` - HFA data integration
- `stage_*_data_*/` - Dataset staging

Each uses Web Workers for non-blocking execution with progress streaming via
SSE.

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
- `INSTANCE_LANGUAGE` - Default language (en/fr)
- `INSTANCE_CALENDAR` - Calendar type (gregorian/ethiopian)

## License

Proprietary - The World Bank, GFF, FASTR Initiative (2025)

Third-party code in `panther/` has separate licensing - see
`panther/LICENSE.txt`
