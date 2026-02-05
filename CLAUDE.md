# WB FASTR - Project Documentation

## Overview

FASTR (Frequent Assessments and System Tools for Resilience) Analytics Platform for processing, visualizing, and analyzing health data. A full-stack web application with modular R-based data processing pipelines.

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
│   ├── ai/                    # AI interpretation (Anthropic)
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

**Project Databases** (per-project, e.g., `project_{uuid}`)

- Project-specific data isolation
- Module instances and configurations
- Presentation objects (visualizations)
- Reports
- Results objects from module execution
- AI interpretations

### Data Processing Pipeline

1. **Import**: CSV/DHIS2 upload → multi-step validation → staging → integration
2. **Processing**: Module execution → R scripts in Docker containers → results storage
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

- English/French UI
- Built from XLSX translation files
- Calendar support (Gregorian/Ethiopian)

**Real-time Updates**

- Server-Sent Events for task progress
- Background worker coordination
- Live dirty state synchronization

## State Management

**Three-tier pattern for client state:**

1. **Global UI State** (`client/src/state/ui.ts`)
   - UI preferences that persist across components
   - Examples: `vizGroupingMode`, `fitWithin`, `showAi`
   - Access: Direct import and use
   - Updates: Use `updateProjectView()` for batch updates
   - Persisted to localStorage where appropriate

2. **Server Data** (Providers/Context)
   - Data from server (projects, modules, metrics, etc.)
   - Examples: `projectDetail`, `projectDirtyStates`
   - Access: Via hooks (`useProjectDetail()`, `useProjectDirtyStates()`)
   - Updates: SSE triggers automatic refetch via `reconcile()`
   - Location: `client/src/components/project_runner/provider.tsx`

3. **Component-Local State**
   - Temporary UI state scoped to single component
   - Examples: `searchText`, `isLoading`, `selectedItems`
   - Access: `createSignal()` within component
   - Does not need to be shared

**Rules:**
- NEVER pass server data as props - use hooks
- NEVER put UI preferences in component state - use global state
- NEVER manually trigger refetch - rely on SSE (provider handles it)
- Use `updateProjectView()` for UI state changes, not individual setters

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

Server: `http://localhost:8000`
Client: `http://localhost:3000`

### Build Tasks

```bash
deno task build:modules       # Generate module definitions
deno task build:translations  # Build i18n strings from XLSX
deno task build:client        # Build client SPA
deno task typecheck           # Check both server + client
```

## Deployment

```bash
./deploy
```

Workflow:

1. Version bump (major/minor/patch)
2. Client build (optional)
3. Module definitions + translations build
4. Docker image build and push
5. Git commit and push

Docker image: `timroberton/comb:wb-fastr-server-v{version}`

## Important Notes

### External Libraries

- `panther/` is an external library - **NEVER** modify files in this directory
- It provides UI components and visualization utilities
- Maintained separately with own licensing

### Code Style

- **Prefer editing existing files** over creating new ones
- **No unnecessary comments** - code should be self-documenting
- **Strict TypeScript typing** - avoid `any`
- Follow existing patterns and conventions
- Use functional programming where appropriate

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

Each uses Web Workers for non-blocking execution with progress streaming via SSE.

### Route Registry

All routes must be registered in `route-tracker.ts` to ensure proper typing and validation.

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

Third-party code in `panther/` has separate licensing - see `panther/LICENSE.txt`
