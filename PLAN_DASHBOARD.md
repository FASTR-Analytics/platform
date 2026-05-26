# Plan: Public Dashboards

## Background

The app currently supports shareable/public links for individual visualizations. When a user creates a share link, the system:
1. Captures a snapshot of the visualization data (frozen at creation time)
2. Generates a UUID token
3. Stores the `ShareVizBundle` (stripped figure inputs + source metadata) in `share_tokens` table
4. Returns a public URL like `/share/viz/{token}`

This works well for single visualizations but doesn't support the client's need to share **multiple related visualizations** with an interactive selector.

### Client Requirement

The World Bank Nigeria team wants to share immunization coverage data across all Nigerian states, with:
- A sidebar menu listing all 36 states + FCT
- A "National" aggregate view
- Users click a menu item to see that state's visualization
- Single shareable URL for the entire collection

This cannot be solved by "show all replicants" because:
1. The National view is not a replicant — it's a separate configuration
2. They want control over ordering and labeling
3. Future dashboards may mix visualizations from different sources

---

## Solution: Dashboard Concept

A **Dashboard** is a new project-level entity that:
- Has a user-defined public slug (e.g., `/d/nigeria-immunization-2024`)
- Contains multiple **DashboardItems**, each with iwts own visualization snapshot
- Supports ordering and labeling of items
- Has a layout system (starting with sidebar navigation)
- Can have a title and logo

### Reusing FigureBlock

The `FigureBlock` pattern from slide decks is the right abstraction:

```typescript
type FigureBlock = {
  type: "figure";
  figureInputs?: FigureInputs;  // stripped snapshot for storage
  source?: FigureSource;         // metadata for potential refresh
};

type FigureSource = {
  type: "from_data";
  metricId: string;
  config: PresentationObjectConfig;  // includes selectedReplicantValue
  snapshotAt: string;
  indicatorMetadata?: IndicatorMetadata[];
};
```

This pattern:
- Stores data as a snapshot (stable, won't break if source changes)
- Preserves source metadata for optional future refresh
- Already handles stripping/hydration for storage efficiency
- Is proven in slide deck implementation

---

## Data Model

### Types

**File: `lib/types/dashboard.ts`** (new file)

```typescript
export type Dashboard = {
  id: string;
  projectId: string;
  slug: string;                    // unique within project, used in public URL
  title: string;
  logoAssetId?: string;            // references assets table
  layout: DashboardLayout;
  items: DashboardItem[];
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardLayout = {
  type: "sidebar";
  menuPosition: "left" | "right";
};

export type DashboardItem = {
  id: string;
  label: string;                   // "National", "Lagos State", etc.
  order: number;
  figureBlock: FigureBlock;        // reuse from slides
  geoData?: unknown;               // for map visualizations
};

// For creating/updating
export type DashboardCreate = {
  slug: string;
  title: string;
  logoAssetId?: string;
  layout?: DashboardLayout;        // defaults to { type: "sidebar", menuPosition: "left" }
};

// API response types
export type DashboardSummary = {
  id: string;
  slug: string;
  title: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardDetail = Dashboard;

// Public access bundle (no auth required)
export type PublicDashboardBundle = {
  title: string;
  logoUrl?: string;                // resolved from assetId
  layout: DashboardLayout;
  items: PublicDashboardItem[];
};

export type PublicDashboardItem = {
  id: string;
  label: string;
  order: number;
  strippedFigureInputs: FigureInputs;
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
    indicatorMetadata?: IndicatorMetadata[];
  };
  geoData?: unknown;
};
```

### Zod Schemas

**File: `lib/types/_dashboard_config.ts`** (new file)

```typescript
import { z } from "zod";

export const dashboardLayoutSchema = z.object({
  type: z.literal("sidebar"),
  menuPosition: z.enum(["left", "right"]),
});

export const dashboardItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  order: z.number(),
  figureBlock: z.object({
    type: z.literal("figure"),
    figureInputs: z.unknown().optional(),
    source: z.unknown().optional(),
  }),
  geoData: z.unknown().optional(),
});

export const dashboardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  logoAssetId: z.string().optional(),
  layout: dashboardLayoutSchema,
  items: z.array(dashboardItemSchema),
  createdByEmail: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DashboardFromSchema = z.infer<typeof dashboardSchema>;
export type DashboardLayoutFromSchema = z.infer<typeof dashboardLayoutSchema>;
export type DashboardItemFromSchema = z.infer<typeof dashboardItemSchema>;
```

### Type Exports

**File: `lib/types/mod.ts`** — add export:

```typescript
export * from "./dashboard.ts";
```

---

## Database Schema

**File: `server/db/migrations/project/018_dashboards.sql`** (new migration)

```sql
CREATE TABLE dashboards (
  id VARCHAR PRIMARY KEY,
  slug VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  logo_asset_id VARCHAR,
  layout JSONB NOT NULL DEFAULT '{"type": "sidebar", "menuPosition": "left"}',
  items JSONB NOT NULL DEFAULT '[]',
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(slug)
);

CREATE INDEX idx_dashboards_slug ON dashboards(slug);
```

### Database Access Layer

**File: `server/db/project/dashboards.ts`** (new file)

```typescript
import { Sql } from "postgres";
import type { APIResponseNoData, APIResponseWithData, DashboardSummary, DashboardDetail } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function getAllDashboards(projectDb: Sql): Promise<APIResponseWithData<DashboardSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await projectDb<DBDashboard[]>`
      SELECT id, slug, title, items, created_at, updated_at
      FROM dashboards ORDER BY updated_at DESC
    `;
    return {
      success: true,
      data: rows.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        itemCount: JSON.parse(d.items).length,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    };
  });
}

export async function getDashboardDetail(projectDb: Sql, dashboardId: string): Promise<APIResponseWithData<DashboardDetail>> { ... }
export async function createDashboard(projectDb: Sql, create: DashboardCreate, createdByEmail: string): Promise<APIResponseWithData<{ dashboardId: string; lastUpdated: string }>> { ... }
export async function updateDashboard(projectDb: Sql, dashboardId: string, update: Partial<DashboardCreate>): Promise<APIResponseWithData<{ lastUpdated: string }>> { ... }
export async function deleteDashboard(projectDb: Sql, dashboardId: string): Promise<APIResponseNoData> { ... }
export async function addDashboardItem(projectDb: Sql, dashboardId: string, item: Omit<DashboardItem, "id" | "order">): Promise<APIResponseWithData<{ itemId: string; lastUpdated: string }>> { ... }
export async function updateDashboardItem(projectDb: Sql, dashboardId: string, itemId: string, update: { label?: string; order?: number }): Promise<APIResponseWithData<{ lastUpdated: string }>> { ... }
export async function deleteDashboardItem(projectDb: Sql, dashboardId: string, itemId: string): Promise<APIResponseWithData<{ lastUpdated: string }>> { ... }
export async function reorderDashboardItems(projectDb: Sql, dashboardId: string, itemIds: string[]): Promise<APIResponseWithData<{ lastUpdated: string }>> { ... }
export async function getDashboardBySlug(projectDb: Sql, slug: string): Promise<APIResponseWithData<DashboardDetail | null>> { ... }
```

Notes:
- Stored in **project database** (not main/instance) since dashboards reference project visualizations
- `items` stored as JSONB array — simpler than separate table, items are always loaded together
- `slug` is unique within project (enforced by unique constraint)
- `layout` stored as JSONB for flexibility as layout options expand

### Database Access Export

**File: `server/db/project/mod.ts`** — add export:

```typescript
export * from "./dashboards.ts";
```

### ID Generation

**File: `server/utils/id_generation.ts`** — add function:

```typescript
export async function generateUniqueDashboardId(db: Sql): Promise<string> {
  return generateUniqueId(db, "dashboards", "db");
}
```

---

## API Routes

### Authenticated Routes (project context)

**File: `server/routes/project/dashboards.ts`** (new file)

Routes follow existing pattern — `projectId` comes from middleware (`c.var.ppk.projectId`), not URL path.

| Method   | Path                                       | Description                                           |
|----------|--------------------------------------------|-------------------------------------------------------|
| `GET`    | `/dashboards`                              | List all dashboards (returns `DashboardSummary[]`)    |
| `GET`    | `/dashboards/:dashboard_id`                | Get dashboard detail                                  |
| `POST`   | `/dashboards`                              | Create dashboard                                      |
| `PUT`    | `/dashboards/:dashboard_id`                | Update dashboard metadata (title, slug, logo, layout) |
| `DELETE` | `/dashboards/:dashboard_id`                | Delete dashboard                                      |
| `POST`   | `/dashboards/:dashboard_id/items`          | Add item to dashboard                                 |
| `PUT`    | `/dashboards/:dashboard_id/items/:item_id` | Update item (label, order)                            |
| `DELETE` | `/dashboards/:dashboard_id/items/:item_id` | Remove item                                           |
| `POST`   | `/dashboards/:dashboard_id/items/reorder`  | Bulk reorder items                                    |

### Route Registry

**File: `lib/api-routes/project/dashboards.ts`** (new file)

```typescript
import { route } from "../route-utils.ts";
import type { DashboardSummary, DashboardDetail, DashboardCreate, DashboardItem } from "../../types/dashboard.ts";

export const dashboardRouteRegistry = {
  getAllDashboards: route({
    path: "/dashboards",
    method: "GET",
    response: {} as DashboardSummary[],
    requiresProject: true,
  }),

  getDashboardDetail: route({
    path: "/dashboards/:dashboard_id",
    method: "GET",
    params: {} as { dashboard_id: string },
    response: {} as DashboardDetail,
    requiresProject: true,
  }),

  createDashboard: route({
    path: "/dashboards",
    method: "POST",
    body: {} as DashboardCreate,
    response: {} as { dashboardId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "PUT",
    params: {} as { dashboard_id: string },
    body: {} as Partial<DashboardCreate>,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboard: route({
    path: "/dashboards/:dashboard_id",
    method: "DELETE",
    params: {} as { dashboard_id: string },
    response: {} as never,
    requiresProject: true,
  }),

  addDashboardItem: route({
    path: "/dashboards/:dashboard_id/items",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as { label: string; figureBlock: FigureBlock; geoData?: unknown },
    response: {} as { itemId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "PUT",
    params: {} as { dashboard_id: string; item_id: string },
    body: {} as { label?: string; order?: number },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  deleteDashboardItem: route({
    path: "/dashboards/:dashboard_id/items/:item_id",
    method: "DELETE",
    params: {} as { dashboard_id: string; item_id: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  reorderDashboardItems: route({
    path: "/dashboards/:dashboard_id/items/reorder",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as { itemIds: string[] },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),
};
```

### Add Items Endpoint

The `POST .../items` endpoint receives complete FigureBlock data from the client:

```typescript
{
  label: string;
  figureBlock: FigureBlock;
  geoData?: unknown;
}
```

**FigureBlock generation happens client-side** (same as slides):
1. User selects visualization via `SelectVisualizationForSlide`
2. If visualization has replicants, user picks one
3. Client fetches data, generates FigureInputs, strips for storage
4. Client POSTs the complete item with FigureBlock to server
5. Server stores it

For **"add all replicants"** — follows established pattern from `create_slide_from_visualization_modal.tsx`:

**File: `client/src/components/dashboards/add_dashboard_item_modal.tsx`** (new file)

```typescript
// Pattern from create_slide_from_visualization_modal.tsx
import { getProgress, ProgressBar, RadioGroup } from "panther";

const progress = getProgress();
const [creationMode, setCreationMode] = createSignal<"single" | "all">("single");
const [replicantOptions, setReplicantOptions] = createSignal<string[]>([]);

// When "all" mode selected, iterate with progress:
for (let i = 0; i < options.length; i++) {
  progress.onProgress(i / options.length, `Adding item ${i + 1} of ${options.length}...`);
  // Generate FigureBlock, POST to server
}
progress.onProgress(1, `Added ${options.length} items`);
```

Key components to reuse:
- `InlineReplicantSelector` — fetches options, calls `onChange(value, allOptions)`
- `getProgress()` + `ProgressBar` — progress tracking
- `RadioGroup` — "Add selected replicant" vs "Add all replicants" choice
- `timActionForm` — form submission with loading state

The single-item flow matches the slides pattern exactly — the server is just storage.

### Public Route (no auth)

**File: `server/routes/public/dashboard.ts`** (new file)

| Method | Path                      | Description                 |
|--------|---------------------------|-----------------------------|
| `GET`  | `/api/d/:projectId/:slug` | Get public dashboard bundle |

```typescript
import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getDashboardBySlug } from "../../db/project/dashboards.ts";

export const routesPublicDashboard = new Hono();

routesPublicDashboard.get("/api/d/:projectId/:slug", async (c) => {
  const { projectId, slug } = c.req.param();
  
  // Connect to project database (projectId IS the database name)
  const projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  
  const result = await getDashboardBySlug(projectDb, slug);
  if (!result.success || !result.data) {
    return c.json({ success: false, err: "Not found" }, 404);
  }
  
  // Transform to PublicDashboardBundle
  const dashboard = result.data;
  const bundle: PublicDashboardBundle = {
    title: dashboard.title,
    logoUrl: dashboard.logoAssetId ? `/assets/${dashboard.logoAssetId}` : undefined,
    layout: dashboard.layout,
    items: dashboard.items.map((item) => ({
      id: item.id,
      label: item.label,
      order: item.order,
      strippedFigureInputs: item.figureBlock.figureInputs!,
      source: {
        config: item.figureBlock.source?.type === "from_data" ? item.figureBlock.source.config : {} as any,
        metricId: item.figureBlock.source?.type === "from_data" ? item.figureBlock.source.metricId : "",
        formatAs: "number",
        indicatorMetadata: item.figureBlock.source?.type === "from_data" ? item.figureBlock.source.indicatorMetadata : undefined,
      },
      geoData: item.geoData,
    })),
  };
  
  return c.json({ success: true, data: bundle });
});
```

Notes:
- No authentication required
- `projectId` from URL is used directly as database name (same pattern as authenticated routes)
- Database connection via `getPgConnectionFromCacheOrNew(projectId, "READ_ONLY")`

---

## Public URL Structure

Public dashboards accessed via: `/d/:projectId/:slug`

Example: `https://fastr.worldbank.org/d/abc123/nigeria-immunization-2024`

The URL contains:
- `projectId`: needed to locate the correct project database
- `slug`: user-friendly identifier chosen at dashboard creation

Alternative considered: Generate a random token like current shares. Rejected because:
- User-defined slugs are more memorable and professional
- Slug uniqueness is scoped to project, avoiding global collision issues
- ProjectId in URL is acceptable — it's already exposed in authenticated routes

---

## Client Components

### Dashboard List & Editor

**File: `client/src/components/dashboards/dashboard_list.tsx`** (new file)

Accessed via new "dashboards" tab in project navigation (parallel to "visualizations" tab).

Features:
- Grid/list of dashboard cards showing title, item count, created date
- Create new dashboard button → opens create modal
- Click dashboard → navigate to editor

### Dashboard Editor

**File: `client/src/components/dashboards/dashboard_editor.tsx`** (new file)

Shown when a dashboard is selected from the list (similar to deck editing pattern).

Layout:
- Header: title (editable), public URL display/copy, settings button
- Left panel: sortable list of items (drag to reorder)
- Right panel: preview of selected item's visualization

Features:
- Edit dashboard metadata (title, slug, logo)
- Add visualization button → opens `SelectVisualizationForSlide` (reused from slides)
  - When visualization has replicants: show "Add selected replicant" vs "Add all replicants" choice
- Reorder items via drag-and-drop
- Edit item labels inline
- Delete items
- Preview renders current visualization

### Create Dashboard Modal

**File: `client/src/components/dashboards/create_dashboard_modal.tsx`** (new file)

Fields:
- Title (required)
- Slug (required, validated: lowercase, alphanumeric + hyphens, unique check)
- Logo (optional, asset picker)

### Public Dashboard Viewer

**File: `client/src/components/public_viewer/dashboard.tsx`** (new file)

Located at route `/d/:projectId/:slug`

Layout (sidebar mode):
- Left sidebar: menu of items (clickable labels)
- Main area: currently selected visualization
- Header: dashboard title + logo

Features:
- No authentication required
- Initial selection: first item by order
- Click menu item → show that visualization
- Download button for current visualization (PNG)
- Responsive: on mobile, menu becomes dropdown or collapsible

---

## Routing

### Server (`main.ts`)

Add import at top:
```typescript
import { routesPublicDashboard } from "./server/routes/public/dashboard.ts";
import { routesDashboards } from "./server/routes/project/dashboards.ts";
```

Add public routes BEFORE auth middleware (after existing share routes):
```typescript
// CORS for public routes (add /api/d/* to existing)
app.use("/api/share/*", corsMiddleware);
app.use("/api/d/*", corsMiddleware);  // ADD THIS

// Public routes (no auth required) - must be before authMiddleware
app.route("/", routesPublicShare);
app.route("/", routesPublicDashboard);  // ADD THIS

// Serve SPA HTML for public routes (before auth)
try {
  const indexHtml = Deno.readTextFileSync("./client_dist/index.html");
  app.get("/share/viz/:token", (c) => c.html(indexHtml));
  app.get("/d/:projectId/:slug", (c) => c.html(indexHtml));  // ADD THIS
} catch {
  // In development, handled by Vite dev server
}
```

Add authenticated routes AFTER auth middleware (with other project routes):
```typescript
app.route("/", routesDashboards);  // ADD after routesSlideDeckFolders
```

### Client

**File: `client/src/app.tsx`** — add public route BEFORE the catch-all:

```typescript
import PublicDashboard from "./components/public_viewer/dashboard.tsx";

// In Router:
<Route path="/d/:projectId/:slug" component={PublicDashboard} />
<Route path="/share/viz/:token" component={PublicVisualization} />
<Route path="/*" component={InstanceLoggedInWrapper} />
```

**File: `client/src/state/t4_ui.ts`** — add to TabOption type:

```typescript
export type TabOption = "reports" | "decks" | "dashboards" | "visualizations" | "metrics" | "modules" | "data" | "settings" | "cache";
```

**File: `client/src/components/project/index.tsx`** — add to allTabs array and Match block:

```typescript
// In allTabs array (after decks, before visualizations):
...(projectState.thisUserPermissions.can_view_slide_decks
  ? [
      {
        value: "dashboards" as const,
        label: t3({ en: "Dashboards", fr: "Tableaux de bord" }),
      },
    ]
  : []),

// In tabIcons object:
dashboards: "grid" as const,  // "grid" icon exists in panther

// In Switch component:
<Match
  when={
    projectTab() === "dashboards" &&
    projectState.thisUserPermissions.can_view_slide_decks
  }
>
  <ProjectDashboards />
</Match>
```

---

## Implementation Phases

### Phase 1: Database & Types

1. Create `lib/types/dashboard.ts` with all type definitions
2. Create Zod schemas in `lib/types/_dashboard_config.ts`
3. Create migration `server/db/migrations/project/018_dashboards.sql`
4. Create database access layer `server/db/project/dashboards.ts`

### Phase 2: Server Routes (Authenticated)

1. Create `server/routes/project/dashboards.ts`
2. Implement CRUD operations for dashboards
3. Implement add/remove/reorder items
4. Implement "add all replicants" bulk operation
5. Register routes in `main.ts`
6. Add to route tracker

### Phase 3: Server Routes (Public)

1. Create `server/routes/public/dashboard.ts`
2. Implement public bundle fetching with hydration
3. Register route before auth middleware

### Phase 4: Client - Dashboard List & Create

1. Create dashboard list page component
2. Create dashboard modal
3. Add route and navigation link in project sidebar
4. Server actions auto-generated from route registry (no manual implementation needed)

### Phase 5: Client - Dashboard Editor

1. Create editor component with item list + preview
2. Integrate `SelectVisualizationForSlide` for adding items
3. Implement "add all replicants" option in selection flow
4. Implement drag-and-drop reordering
5. Implement inline label editing
6. Implement delete with confirmation

### Phase 6: Client - Public Viewer

1. Create public dashboard viewer component
2. Implement sidebar layout with menu
3. Implement visualization rendering (reuse `ChartHolder` pattern from share viewer)
4. Add download functionality
5. Mobile responsive layout

### Phase 7: Polish & Edge Cases

1. Slug validation (uniqueness check, format validation)
2. Empty state handling
3. Loading states
4. Error handling
5. Logo upload/display

---

## Files to Create

| File                                                          | Description              |
|---------------------------------------------------------------|--------------------------|
| `lib/types/dashboard.ts`                                      | Type definitions         |
| `lib/types/_dashboard_config.ts`                              | Zod schemas              |
| `lib/api-routes/project/dashboards.ts`                        | Route registry           |
| `server/db/migrations/project/018_dashboards.sql`             | Database migration       |
| `server/db/project/dashboards.ts`                             | Database access layer    |
| `server/routes/project/dashboards.ts`                         | Authenticated API routes |
| `server/routes/public/dashboard.ts`                           | Public API route         |
| `client/src/state/project/t2_dashboards.ts`                   | T2 reactive cache        |
| `client/src/components/dashboards/dashboard_list.tsx`         | List page                |
| `client/src/components/dashboards/dashboard_editor.tsx`       | Editor page              |
| `client/src/components/dashboards/create_dashboard_modal.tsx` | Create modal             |
| `client/src/components/dashboards/add_dashboard_item_modal.tsx` | Add item modal (with "add all replicants" support) |
| `client/src/components/dashboards/dashboard_item_list.tsx`    | Sortable item list       |
| `client/src/components/project/project_dashboards.tsx`        | Dashboards tab wrapper   |
| `client/src/components/public_viewer/dashboard.tsx`           | Public viewer            |

## Files to Modify (with code snippets)

### `lib/types/mod.ts`

```typescript
export * from "./dashboard.ts";  // ADD THIS LINE
```

### `lib/api-routes/combined.ts`

```typescript
import { dashboardRouteRegistry } from "./project/dashboards.ts";  // ADD IMPORT

export const routeRegistry = {
  // ... existing registries ...
  ...dashboardRouteRegistry,  // ADD THIS LINE
} as const;
```

## Files to Modify (summary table)

| File                                                | Change                                                              |
|-----------------------------------------------------|---------------------------------------------------------------------|
| `lib/types/mod.ts`                                  | Add `export * from "./dashboard.ts";`                               |
| `lib/types/project_dirty_states.ts`                 | Add `"dashboards"` to `LastUpdateTableName` and `_LAST_UPDATE_TABLE_NAMES` |
| `lib/types/project_sse.ts`                          | Import `DashboardSummary`, add `dashboards: DashboardSummary[]` to `ProjectState`, add `dashboards_updated` message type |
| `lib/api-routes/combined.ts`                        | Import and spread `dashboardRouteRegistry`                          |
| `server/db/project/mod.ts`                          | Add `export * from "./dashboards.ts";`                              |
| `main.ts`                                           | Import routes, add CORS for `/api/d/*`, register public route before auth, register authenticated route after auth, serve HTML for `/d/:projectId/:slug` |
| `server/task_management/notify_project_v2.ts`       | Import `DashboardSummary`, add `notifyProjectDashboardsUpdated()` function |
| `server/routes/project/project-sse-v2.ts`           | Import `getAllDashboards`, include dashboards in initial `ProjectState` payload |
| `client/src/app.tsx`                                | Import `PublicDashboard`, add route `/d/:projectId/:slug` before catch-all |
| `client/src/state/t4_ui.ts`                         | Add `"dashboards"` to `TabOption` union                             |
| `client/src/state/project/t1_store.ts`              | Add `dashboards: []` to empty state, add `dashboards: {}` to `lastUpdated`, add `"dashboards_updated"` case in handler |
| `client/src/components/project/index.tsx`           | Import `ProjectDashboards`, add to `allTabs` (uses `can_view_slide_decks`), add `dashboards: "grid"` to `tabIcons`, add `Match` block |
| `server/utils/id_generation.ts`                     | Add `generateUniqueDashboardId()` function                          |
| `server/db/project/projects.ts`                     | Import `getAllDashboards`, fetch in `getProjectDetail()`, include in return |
| `server/task_management/build_project_state.ts`     | Add `dashboards: detail.dashboards` to ProjectState construction    |
| `lib/types/projects.ts`                             | Add `dashboards: DashboardSummary[]` to `ProjectDetail` type        |

---

## SSE & State Management

Dashboards follow the same T1/T2 tier pattern as slide decks (see `DOC_STATE_MGT_PROJECT.md`).

### T1: SSE Store Additions

**File: `lib/types/project_dirty_states.ts`** — add to `LastUpdateTableName`:

```typescript
export type LastUpdateTableName =
  | "dashboards"  // ADD THIS
  | "datasets"
  | "modules"
  | "presentation_objects"
  | "slide_decks"
  | "slides";

export const _LAST_UPDATE_TABLE_NAMES = [
  "dashboards",  // ADD THIS
  "datasets",
  // ...
] as const satisfies readonly LastUpdateTableName[];
```

**File: `lib/types/project_sse.ts`** — add to `ProjectState` and `ProjectSseMessage`:

```typescript
export type ProjectState = {
  // ... existing fields ...
  dashboards: DashboardSummary[];  // ADD THIS
  // lastUpdated already includes dashboards via LastUpdateTableName
};

export type ProjectSseMessage =
  // ... existing messages ...
  | { type: "dashboards_updated"; data: { dashboards: DashboardSummary[] } }  // ADD THIS
```

**File: `client/src/state/project/t1_store.ts`** — add to empty state and handler:

```typescript
const EMPTY_PROJECT_STATE: ProjectState = {
  // ... existing fields ...
  dashboards: [],
  lastUpdated: {
    dashboards: {},  // ADD THIS
    datasets: {},
    // ...
  },
};

// In applyProjectSseMessage:
case "dashboards_updated":
  setProjectState("dashboards", reconcile(msg.data.dashboards));
  break;
```

**File: `server/task_management/notify_project_v2.ts`** — add notification function:

```typescript
export function notifyProjectDashboardsUpdated(
  projectId: string,
  dashboards: DashboardSummary[]
): void {
  notifyProjectV2(projectId, {
    type: "dashboards_updated",
    data: { dashboards },
  });
}
```

### T2: Reactive Cache

**File: `client/src/state/project/t2_dashboards.ts`** (new file)

```typescript
import { createReactiveCache } from "~/state/_infra/reactive_cache";
import { projectState } from "./t1_store";
import { serverActions } from "~/server_actions";

const dashboardDetailCache = createReactiveCache<DashboardDetail>();

export async function getDashboardDetailFromCacheOrFetch(
  projectId: string,
  dashboardId: string
): Promise<APIResponseWithData<DashboardDetail>> {
  const version = projectState.lastUpdated.dashboards[dashboardId] ?? "";
  return dashboardDetailCache.getOrFetch(
    `${projectId}:${dashboardId}`,
    version,
    () => serverActions.getDashboardDetail({ projectId, dashboard_id: dashboardId })
  );
}
```

### ProjectDetail Type Update

**File: `lib/types/projects.ts`** — add to `ProjectDetail` type:

```typescript
import type { DashboardSummary } from "./dashboard.ts";

export type ProjectDetail = {
  // ... existing fields ...
  dashboards: DashboardSummary[];  // ADD THIS
};
```

### Project Detail Fetch Update

**File: `server/db/project/projects.ts`** — in `getProjectDetail()`:

```typescript
import { getAllDashboards } from "./dashboards.ts";

// In getProjectDetail(), add fetch:
const resDashboards = await getAllDashboards(projectDb);
throwIfErrWithData(resDashboards);

// In projectDetail return object:
const projectDetail: ProjectDetail = {
  // ... existing fields ...
  dashboards: resDashboards.data,  // ADD THIS
};
```

### Build Project State Update

**File: `server/task_management/build_project_state.ts`** — add to projectState construction:

```typescript
const projectState: ProjectState = {
  // ... existing fields from detail ...
  dashboards: detail.dashboards,  // ADD THIS
  // ... existing fields from dirtyStates ...
};
```

### Permissions

Dashboards reuse slide deck permissions:
- `can_view_slide_decks` → can view dashboards tab and list
- `can_configure_slide_decks` → can create/edit/delete dashboards

No new permissions or database migrations required.

### Tab Icon

Use `"grid"` icon for the dashboards tab in `project/index.tsx` (verified to exist in panther).

---

## Future Enhancements (Out of Scope)

1. **Additional layouts**: grid, carousel, tabs
2. **View analytics**: track which items are viewed most
3. **Embed mode**: `?embed=true` for iframe embedding
4. **Password protection**: optional password for sensitive dashboards
5. **Expiration**: auto-expire dashboards after N days
6. **Refresh capability**: button to refresh all items from source data
7. **Mixed visualizations**: items from different visualizations (already supported by data model)
8. **Custom styling**: per-dashboard color themes

---

## Relationship to Existing Shares

Dashboards and single-visualization shares (`share_tokens`) coexist:
- **Single share**: quick, one-off sharing of a single visualization
- **Dashboard**: curated collection with navigation, suitable for formal distribution

No migration needed. Users continue using single shares for simple cases and create dashboards when they need multi-visualization collections.

---

## Summary

| Aspect                 | Decision                                    |
|------------------------|---------------------------------------------|
| Storage location       | Project database                            |
| URL structure          | `/d/:projectId/:slug`                       |
| Slug                   | User-defined, validated, unique per project |
| Data approach          | Snapshot via FigureBlock pattern            |
| Item creation          | One-by-one or bulk "add all replicants"     |
| Visualization selector | Reuse from slides                           |
| Initial layout         | Sidebar only                                |
| Relationship to shares | Coexist, different use cases                |
