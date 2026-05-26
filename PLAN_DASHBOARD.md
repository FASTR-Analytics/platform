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
- Has a user-defined public slug (e.g., `/d/{projectId}/nigeria-immunization-2024`)
- Contains multiple **DashboardItems**, each with its own visualization snapshot
- Supports ordering and labeling of items
- Has a layout system (starting with sidebar navigation)
- Has a title
- Has an explicit `is_public` flag — must be toggled on before the public URL works (404 until published)

### Reusing FigureBlock

The `FigureBlock` pattern from slide decks is the right abstraction:

```typescript
type FigureBlock = {
  type: "figure";
  figureInputs?: FigureInputs;  // stripped snapshot for storage
  source?: FigureSource;         // metadata for potential refresh
};

type FigureSource =
  | {
      type: "from_data";
      metricId: string;
      config: PresentationObjectConfig;
      snapshotAt: string;
      indicatorMetadata?: IndicatorMetadata[];
    }
  | {
      type: "custom";
      description?: string;
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
import type { FigureInputs } from "@timroberton/panther";
import type { FigureBlock, FigureSource } from "./slides.ts";
import type { IndicatorMetadata, PresentationObjectConfig } from "./presentation_objects.ts";

// Re-export for convenience
export type { FigureBlock, FigureSource };

export type Dashboard = {
  id: string;
  slug: string;                    // unique within project, used in public URL
  title: string;
  isPublic: boolean;               // when false, public URL returns 404
  layout: DashboardLayout;
  items: DashboardItem[];          // loaded separately from dashboard_items table
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
  dashboardId: string;
  label: string;                   // "National", "Lagos State", etc.
  sortOrder: number;
  figureBlock: FigureBlock;        // reuse from slides
  geoData?: unknown;               // for map visualizations (per item, since each item is its own viz)
  lastUpdated: string;
};

// For creating/updating
export type DashboardCreate = {
  slug: string;
  title: string;
  layout?: DashboardLayout;        // defaults to { type: "sidebar", menuPosition: "left" }
};

export type DashboardUpdate = {
  slug?: string;
  title?: string;
  isPublic?: boolean;
  layout?: DashboardLayout;
};

// API response types
export type DashboardSummary = {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardDetail = Dashboard;

// Public access bundle (no auth required)
export type PublicDashboardBundle = {
  title: string;
  layout: DashboardLayout;
  items: PublicDashboardItem[];
};

export type PublicDashboardItem = {
  id: string;
  label: string;
  sortOrder: number;
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

### Slug Validation Rules

- Lowercase only
- Alphanumeric + hyphens (`a-z`, `0-9`, `-`)
- 3-60 characters
- Cannot start or end with hyphen
- Cannot contain consecutive hyphens

Regex: `^[a-z0-9]+(-[a-z0-9]+)*$` (3-60 chars)

Uniqueness enforced by DB constraint within the project database. On conflict, server returns error and client surfaces it.

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
  dashboardId: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  figureBlock: z.object({
    type: z.literal("figure"),
    figureInputs: z.unknown().optional(),
    source: z.unknown().optional(),
  }),
  geoData: z.unknown().optional(),
  lastUpdated: z.string(),
});

export const dashboardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  isPublic: z.boolean(),
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
CREATE TABLE IF NOT EXISTS dashboards (
  id VARCHAR PRIMARY KEY,
  slug VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  layout JSONB NOT NULL DEFAULT '{"type": "sidebar", "menuPosition": "left"}',
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW(),

  UNIQUE(slug)
);

CREATE INDEX IF NOT EXISTS idx_dashboards_slug ON dashboards(slug);

CREATE TABLE IF NOT EXISTS dashboard_items (
  id VARCHAR PRIMARY KEY,
  dashboard_id VARCHAR NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  label VARCHAR NOT NULL,
  sort_order INTEGER NOT NULL,
  figure_block JSONB NOT NULL,
  geo_data JSONB,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_items_dashboard_id ON dashboard_items(dashboard_id);
```

Items are a separate table (matching the `slide_decks` / `slides` pattern). This enables atomic per-item operations and avoids rewriting an entire dashboard row when a single item changes — important when each item carries a stripped `FigureInputs` payload (potentially hundreds of KB per item, ~37 items in the Nigeria case).

### Database Types

**File: `server/db/project/_project_database_types.ts`** — add types:

```typescript
export type DBDashboard = {
  id: string;
  slug: string;
  title: string;
  is_public: boolean;
  layout: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  last_updated: string;
};

export type DBDashboardItem = {
  id: string;
  dashboard_id: string;
  label: string;
  sort_order: number;
  figure_block: string;
  geo_data: string | null;
  last_updated: string;
};
```

### Database Access Layer

**File: `server/db/project/dashboards.ts`** (new file)

```typescript
import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  DashboardSummary,
  DashboardDetail,
  DashboardItem,
  DashboardCreate,
  DashboardUpdate,
  FigureBlock,
} from "lib";
import { parseJsonOrThrow } from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";
import { DBDashboard, DBDashboardItem } from "./_project_database_types.ts";
import { generateUniqueDashboardId, generateUniqueDashboardItemId } from "../../utils/id_generation.ts";

export async function getAllDashboards(projectDb: Sql): Promise<APIResponseWithData<DashboardSummary[]>>;
export async function getDashboardDetail(projectDb: Sql, dashboardId: string): Promise<APIResponseWithData<DashboardDetail>>;
export async function getDashboardBySlug(projectDb: Sql, slug: string): Promise<APIResponseWithData<DashboardDetail | null>>;
export async function createDashboard(projectDb: Sql, create: DashboardCreate, createdByEmail: string): Promise<APIResponseWithData<{ dashboardId: string; lastUpdated: string }>>;
export async function updateDashboard(projectDb: Sql, dashboardId: string, update: DashboardUpdate): Promise<APIResponseWithData<{ lastUpdated: string }>>;
export async function deleteDashboard(projectDb: Sql, dashboardId: string): Promise<APIResponseNoData>;
export async function addDashboardItem(projectDb: Sql, dashboardId: string, item: { label: string; figureBlock: FigureBlock; geoData?: unknown }): Promise<APIResponseWithData<{ itemId: string; lastUpdated: string }>>;
export async function updateDashboardItem(projectDb: Sql, dashboardId: string, itemId: string, update: { label?: string }): Promise<APIResponseWithData<{ lastUpdated: string }>>;
export async function deleteDashboardItem(projectDb: Sql, dashboardId: string, itemId: string): Promise<APIResponseWithData<{ lastUpdated: string }>>;
export async function moveDashboardItems(projectDb: Sql, dashboardId: string, itemIds: string[], position: { after: string } | { before: string } | { toStart: true } | { toEnd: true }): Promise<APIResponseWithData<{ lastUpdated: string }>>;
```

Notes:
- Stored in **project database** (not main/instance) since dashboards reference project visualizations
- `slug` unique within project DB (natural per-project scoping since project DBs are isolated)
- `layout` stored as JSONB
- Item operations transactionally update the parent dashboard's `last_updated`
- `moveDashboardItems` mirrors the `moveSlides` pattern (position-based reordering, not bulk array replace)

### Database Access Export

**File: `server/db/project/mod.ts`** — add export:

```typescript
export * from "./dashboards.ts";
```

### ID Generation

**File: `server/utils/id_generation.ts`** — add functions following the existing pattern:

```typescript
export async function generateUniqueDashboardId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM dashboards WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique dashboard ID after 10 attempts");
}

export async function generateUniqueDashboardItemId(db: Sql): Promise<string> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    const existing = await db`SELECT 1 FROM dashboard_items WHERE id = ${id}`;
    if (existing.length === 0) return id;
  }
  throw new Error("Failed to generate unique dashboard item ID after 10 attempts");
}
```

---

## API Routes

### Authenticated Routes (project context)

**File: `server/routes/project/dashboards.ts`** (new file)

Routes follow existing pattern — `projectId` comes from middleware (`c.var.ppk.projectId`), not URL path.

| Method   | Path                                       | Description                                              |
|----------|--------------------------------------------|----------------------------------------------------------|
| `GET`    | `/dashboards`                              | List all dashboards (returns `DashboardSummary[]`)       |
| `GET`    | `/dashboards/:dashboard_id`                | Get dashboard detail with all items                      |
| `POST`   | `/dashboards`                              | Create dashboard                                         |
| `PUT`    | `/dashboards/:dashboard_id`                | Update dashboard metadata (title, slug, isPublic, layout)|
| `DELETE` | `/dashboards/:dashboard_id`                | Delete dashboard (cascades to items)                     |
| `POST`   | `/dashboards/:dashboard_id/items`          | Add item to dashboard                                    |
| `PUT`    | `/dashboards/:dashboard_id/items/:item_id` | Update item (label)                                      |
| `DELETE` | `/dashboards/:dashboard_id/items/:item_id` | Remove item                                              |
| `POST`   | `/dashboards/:dashboard_id/items/move`     | Move items to a new position                             |

After each mutation:
- Call `notifyLastUpdated(projectId, "dashboards", [dashboardId], lastUpdated)` and (for item changes) `notifyLastUpdated(projectId, "dashboard_items", [itemId], lastUpdated)`
- Call `notifyProjectDashboardsUpdated(projectId, summaries)` to refresh the list

### Route Registry

**File: `lib/api-routes/project/dashboards.ts`** (new file)

```typescript
import { route } from "../route-utils.ts";
import type {
  DashboardSummary,
  DashboardDetail,
  DashboardCreate,
  DashboardUpdate,
  FigureBlock,
} from "../../types/dashboard.ts";

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
    body: {} as DashboardUpdate,
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
    body: {} as { label?: string },
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

  moveDashboardItems: route({
    path: "/dashboards/:dashboard_id/items/move",
    method: "POST",
    params: {} as { dashboard_id: string },
    body: {} as {
      itemIds: string[];
      position: { after: string } | { before: string } | { toStart: true } | { toEnd: true };
    },
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

Key components to reuse:
- `SelectVisualizationForSlide` — choose visualization + replicant
- `InlineReplicantSelector` — when in "all replicants" mode, used to fetch the full list
- `getProgress()` + `ProgressBar` — progress tracking during bulk add
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
import type { PublicDashboardBundle } from "lib";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const routesPublicDashboard = new Hono();

routesPublicDashboard.get("/api/d/:projectId/:slug", async (c) => {
  const { projectId, slug } = c.req.param();

  // Validate projectId format before opening a DB connection
  if (!UUID_REGEX.test(projectId)) {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  let projectDb;
  try {
    projectDb = getPgConnectionFromCacheOrNew(projectId, "READ_ONLY");
  } catch {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  const result = await getDashboardBySlug(projectDb, slug);
  if (!result.success || !result.data || !result.data.isPublic) {
    return c.json({ success: false, err: "Not found" }, 404);
  }

  const dashboard = result.data;
  const bundle: PublicDashboardBundle = {
    title: dashboard.title,
    layout: dashboard.layout,
    items: dashboard.items.map((item) => ({
      id: item.id,
      label: item.label,
      sortOrder: item.sortOrder,
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
- `projectId` validated as UUID before opening DB connection (prevents arbitrary DB name input)
- Connection failure also returns 404
- Dashboard must have `isPublic = true` or response is 404 (avoids accidentally exposing dashboards in progress)
- Connection cached via `getPgConnectionFromCacheOrNew(projectId, "READ_ONLY")` — same pattern as authenticated routes

---

## Public URL Structure

Public dashboards accessed via: `/d/:projectId/:slug`

Example: `https://fastr.worldbank.org/d/abc123-def4-5678-90ab-cdef12345678/nigeria-immunization-2024`

The URL contains:
- `projectId`: needed to locate the correct project database
- `slug`: user-friendly identifier chosen at dashboard creation

A dashboard returns 404 unless `is_public = true`. Toggling the flag is how users "publish" or "unpublish" a dashboard.

Alternative considered: Generate a random token like current shares. Rejected because:
- User-defined slugs are more memorable and professional
- Slug uniqueness is scoped to project, avoiding global collision issues
- ProjectId in URL is acceptable — it's already exposed in authenticated routes
- The `is_public` gate provides explicit publishing control

---

## Client Components

### Dashboard List & Editor

**File: `client/src/components/dashboards/dashboard_list.tsx`** (new file)

Accessed via new "dashboards" tab in project navigation (parallel to "decks" tab).

Features:
- Grid/list of dashboard cards showing title, item count, public/private status, created date
- Create new dashboard button → opens create modal
- Click dashboard → navigate to editor

### Dashboard Editor

**File: `client/src/components/dashboards/dashboard_editor.tsx`** (new file)

Shown when a dashboard is selected from the list (similar to deck editing pattern).

Layout:
- Header: title (editable), publish toggle, public URL display/copy (only shown when published), settings button
- Left panel: sortable list of items (drag to reorder via SortableJS)
- Right panel: preview of selected item's visualization (reuses ChartHolder)

Features:
- Edit dashboard metadata (title, slug, layout)
- Toggle public/private (when public, copy URL button appears)
- Add visualization button → opens `SelectVisualizationForSlide` (reused from slides)
  - When visualization has replicants: show "Add selected replicant" vs "Add all replicants" choice
- Reorder items via drag-and-drop (SortableJS, calls `moveDashboardItems`)
- Edit item labels inline
- Delete items with confirmation
- Preview renders current visualization

### Create Dashboard Modal

**File: `client/src/components/dashboards/create_dashboard_modal.tsx`** (new file)

Fields:
- Title (required)
- Slug (required, validated client-side: regex `^[a-z0-9]+(-[a-z0-9]+)*$`, 3-60 chars; auto-suggested from title)

New dashboards default to `is_public = false`. User publishes from the editor.

### Public Dashboard Viewer

**File: `client/src/components/public_viewer/dashboard.tsx`** (new file)

Located at route `/d/:projectId/:slug`

Layout (sidebar mode):
- Left sidebar: menu of items (clickable labels, sorted by `sortOrder`)
- Main area: currently selected visualization (uses `hydrateFigureInputsForPublicRendering` + `ChartHolder`, same as `client/src/components/public_viewer/visualization.tsx`)
- Header: dashboard title

Features:
- No authentication required
- Fetches via `GET /api/d/:projectId/:slug` (plain `fetch()`, no credentials)
- Initial selection: first item by sortOrder
- Click menu item → show that visualization
- Download button for current visualization (PNG)
- Responsive: on mobile, menu becomes dropdown or collapsible
- 404 page if dashboard not found or not published

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
app.route("/", routesDashboards);  // ADD after routesSlideDecks
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
dashboards: "grid" as const,

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

## SSE & State Management

Dashboards follow the same T1/T2 tier pattern as slide decks (see `DOC_STATE_MGT_PROJECT.md`).

### T1: SSE Store Additions

**File: `lib/types/project_dirty_states.ts`** — add to `LastUpdateTableName` and `_LAST_UPDATE_TABLE_NAMES`:

```typescript
export type LastUpdateTableName =
  | "dashboards"        // ADD THIS
  | "dashboard_items"   // ADD THIS
  | "datasets"
  | "modules"
  | "presentation_objects"
  | "slide_decks"
  | "slides";

export const _LAST_UPDATE_TABLE_NAMES = [
  "dashboards",        // ADD THIS
  "dashboard_items",   // ADD THIS
  "datasets",
  "modules",
  "presentation_objects",
  "slide_decks",
  "slides",
] as const satisfies readonly LastUpdateTableName[];
```

**File: `lib/types/project_sse.ts`** — add to `ProjectState` and `ProjectSseMessage`:

```typescript
export type ProjectState = {
  // ... existing fields ...
  dashboards: DashboardSummary[];  // ADD THIS
  // lastUpdated already includes dashboards + dashboard_items via LastUpdateTableName
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
    dashboards: {},         // ADD THIS
    dashboard_items: {},    // ADD THIS
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

Pattern matches `t2_presentation_objects.ts`:

```typescript
import { createReactiveCache } from "~/state/_infra/reactive_cache";
import { projectState } from "./t1_store";
import { serverActions } from "~/server_actions";

export const _DASHBOARD_DETAIL_CACHE = createReactiveCache<
  { projectId: string; dashboardId: string },
  DashboardDetail
>({
  name: "dashboard_detail",
  uniquenessKeys: (params) => [params.projectId, params.dashboardId],
  versionKey: (params, pds) =>
    pds.lastUpdated.dashboards[params.dashboardId] ?? "unknown",
});

export async function getDashboardDetailFromCacheOrFetch(
  projectId: string,
  dashboardId: string,
): Promise<APIResponseWithData<DashboardDetail>> {
  // ... same pattern as getPODetailFromCacheorFetch
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
- `can_configure_slide_decks` → can create/edit/delete/publish dashboards

No new permissions or database migrations required for permissions.

### Tab Icon

Use `"grid"` icon for the dashboards tab in `project/index.tsx`.

---

## Implementation Phases

### Phase 1: Database & Types

1. Create `lib/types/dashboard.ts` with all type definitions
2. Create Zod schemas in `lib/types/_dashboard_config.ts`
3. Add `dashboards` and `dashboard_items` to `LastUpdateTableName` + `_LAST_UPDATE_TABLE_NAMES`
4. Add `dashboards: DashboardSummary[]` to `ProjectDetail` and `ProjectState`
5. Add `dashboards_updated` message type to `ProjectSseMessage`
6. Create migration `server/db/migrations/project/018_dashboards.sql` (both tables)
7. Add `DBDashboard` and `DBDashboardItem` types
8. Add `generateUniqueDashboardId` and `generateUniqueDashboardItemId` to `id_generation.ts`
9. Create database access layer `server/db/project/dashboards.ts`
10. Export from `server/db/project/mod.ts`
11. Wire dashboards into `getProjectDetail()` and `build_project_state.ts`

### Phase 2: Server Routes (Authenticated)

1. Create route registry `lib/api-routes/project/dashboards.ts`
2. Register in `lib/api-routes/combined.ts`
3. Create `server/routes/project/dashboards.ts` with all handlers
4. Implement CRUD operations for dashboards + items (with `notifyLastUpdated` and `notifyProjectDashboardsUpdated`)
5. Add `notifyProjectDashboardsUpdated` to `notify_project_v2.ts`
6. Register routes in `main.ts` after auth middleware

### Phase 3: Server Routes (Public)

1. Create `server/routes/public/dashboard.ts`
2. Implement public bundle fetching with projectId validation and `is_public` check
3. Register route in `main.ts` before auth middleware
4. Add CORS for `/api/d/*`
5. Add SPA HTML serve for `/d/:projectId/:slug` before auth

### Phase 4: Client - State & List

1. Create `client/src/state/project/t2_dashboards.ts` reactive cache
2. Add `"dashboards_updated"` case in `t1_store.ts` SSE handler
3. Add `dashboards: []` and `lastUpdated.dashboards`, `lastUpdated.dashboard_items` to empty state
4. Add `"dashboards"` to `TabOption` in `t4_ui.ts`
5. Create dashboard list page component
6. Create dashboard tab wrapper component
7. Add tab + Match block in `project/index.tsx`

### Phase 5: Client - Create & Editor

1. Create create dashboard modal with slug validation
2. Create dashboard editor component (header + item list + preview pane)
3. Implement publish toggle and copy URL UI
4. Integrate `SelectVisualizationForSlide` for adding items
5. Implement "add all replicants" option with progress bar
6. Implement drag-and-drop reordering via SortableJS (matches `slide_list.tsx`)
7. Implement inline label editing
8. Implement delete with confirmation

### Phase 6: Client - Public Viewer

1. Create public dashboard viewer component
2. Implement sidebar layout with menu
3. Implement visualization rendering (reuse `hydrateFigureInputsForPublicRendering` + `ChartHolder`)
4. Add download functionality
5. Mobile responsive layout
6. 404 state when dashboard not found or unpublished
7. Add public route to `app.tsx` before catch-all

### Phase 7: Polish & Edge Cases

1. Empty states (no dashboards, dashboard with no items)
2. Loading states
3. Error handling (slug conflict, network errors)
4. Confirm unpublish UX (warn that public URL will stop working)
5. Manual testing of full flow

---

## Files to Create

| File                                                            | Description                                        |
|-----------------------------------------------------------------|----------------------------------------------------|
| `lib/types/dashboard.ts`                                        | Type definitions                                   |
| `lib/types/_dashboard_config.ts`                                | Zod schemas                                        |
| `lib/api-routes/project/dashboards.ts`                          | Route registry                                     |
| `server/db/migrations/project/018_dashboards.sql`               | Database migration (both tables)                   |
| `server/db/project/dashboards.ts`                               | Database access layer                              |
| `server/routes/project/dashboards.ts`                           | Authenticated API routes                           |
| `server/routes/public/dashboard.ts`                             | Public API route                                   |
| `client/src/state/project/t2_dashboards.ts`                     | T2 reactive cache                                  |
| `client/src/components/dashboards/dashboard_list.tsx`           | List page                                          |
| `client/src/components/dashboards/dashboard_editor.tsx`         | Editor page                                        |
| `client/src/components/dashboards/create_dashboard_modal.tsx`   | Create modal                                       |
| `client/src/components/dashboards/add_dashboard_item_modal.tsx` | Add item modal (with "add all replicants" support) |
| `client/src/components/dashboards/dashboard_item_list.tsx`      | Sortable item list                                 |
| `client/src/components/project/project_dashboards.tsx`          | Dashboards tab wrapper                             |
| `client/src/components/public_viewer/dashboard.tsx`             | Public viewer                                      |

## Files to Modify

| File                                                | Change                                                              |
|-----------------------------------------------------|---------------------------------------------------------------------|
| `lib/types/mod.ts`                                  | Add `export * from "./dashboard.ts";`                               |
| `lib/types/project_dirty_states.ts`                 | Add `"dashboards"` and `"dashboard_items"` to `LastUpdateTableName` and `_LAST_UPDATE_TABLE_NAMES` |
| `lib/types/project_sse.ts`                          | Import `DashboardSummary`, add `dashboards: DashboardSummary[]` to `ProjectState`, add `dashboards_updated` message type |
| `lib/types/projects.ts`                             | Add `dashboards: DashboardSummary[]` to `ProjectDetail` type        |
| `lib/api-routes/combined.ts`                        | Import and spread `dashboardRouteRegistry`                          |
| `server/db/project/_project_database_types.ts`      | Add `DBDashboard` and `DBDashboardItem` types                       |
| `server/db/project/mod.ts`                          | Add `export * from "./dashboards.ts";`                              |
| `server/db/project/projects.ts`                     | Import `getAllDashboards`, fetch in `getProjectDetail()`, include in return |
| `server/utils/id_generation.ts`                     | Add `generateUniqueDashboardId()` and `generateUniqueDashboardItemId()` functions |
| `server/task_management/notify_project_v2.ts`       | Import `DashboardSummary`, add `notifyProjectDashboardsUpdated()` function |
| `server/task_management/build_project_state.ts`     | Add `dashboards: detail.dashboards` to ProjectState construction    |
| `server/routes/project/project-sse-v2.ts`           | No change needed — `getProjectDetail()` already includes dashboards |
| `main.ts`                                           | Import routes, add CORS for `/api/d/*`, register public route before auth, register authenticated route after auth, serve HTML for `/d/:projectId/:slug` |
| `client/src/app.tsx`                                | Import `PublicDashboard`, add route `/d/:projectId/:slug` before catch-all |
| `client/src/state/t4_ui.ts`                         | Add `"dashboards"` to `TabOption` union                             |
| `client/src/state/project/t1_store.ts`              | Add `dashboards: []` to empty state, add `dashboards: {}` and `dashboard_items: {}` to `lastUpdated`, add `"dashboards_updated"` case in handler |
| `client/src/components/project/index.tsx`           | Import `ProjectDashboards`, add to `allTabs` (uses `can_view_slide_decks`), add `dashboards: "grid"` to `tabIcons`, add `Match` block |

---

## Future Enhancements (Out of Scope)

1. **Logo support**: per-dashboard logo (requires public asset serving — non-trivial because current static middleware serves `_ASSETS_DIR_PATH` at root with `requireGlobalPermission`, and `client_dist/assets/` may shadow paths; design needed later)
2. **Additional layouts**: grid, carousel, tabs
3. **View analytics**: track which items are viewed most (like `share_tokens.view_count`)
4. **Embed mode**: `?embed=true` for iframe embedding
5. **Password protection**: optional password for sensitive dashboards
6. **Expiration**: auto-expire dashboards after N days
7. **Refresh capability**: button to refresh all items from source data
8. **Mixed visualizations**: items from different visualizations (already supported by data model)
9. **Custom styling**: per-dashboard color themes
10. **Separate `can_view_dashboards` / `can_configure_dashboards` permissions** (currently reuses slide deck permissions)

---

## Relationship to Existing Shares

Dashboards and single-visualization shares (`share_tokens`) coexist:
- **Single share**: quick, one-off sharing of a single visualization
- **Dashboard**: curated collection with navigation, suitable for formal distribution

No migration needed. Users continue using single shares for simple cases and create dashboards when they need multi-visualization collections.

---

## Summary

| Aspect                 | Decision                                                    |
|------------------------|-------------------------------------------------------------|
| Storage location       | Project database                                            |
| Items storage          | Separate `dashboard_items` table (matches slides pattern)   |
| URL structure          | `/d/:projectId/:slug`                                       |
| Slug                   | User-defined, validated, unique per project                 |
| Public access          | Explicit `is_public` flag; 404 until published              |
| projectId validation   | UUID regex check before opening DB connection               |
| Logo                   | Out of scope for v1                                         |
| Permissions            | Reuse `can_view_slide_decks` / `can_configure_slide_decks`  |
| Data approach          | Snapshot via FigureBlock pattern                            |
| Item creation          | One-by-one or bulk "add all replicants"                     |
| Visualization selector | Reuse `SelectVisualizationForSlide` from slides             |
| Reorder UI             | SortableJS via `moveDashboardItems` (mirrors `moveSlides`)  |
| Initial layout         | Sidebar only                                                |
| Relationship to shares | Coexist, different use cases                                |
