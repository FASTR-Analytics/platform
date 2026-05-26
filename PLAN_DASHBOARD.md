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

Notes:
- Stored in **project database** (not main/instance) since dashboards reference project visualizations
- `items` stored as JSONB array — simpler than separate table, items are always loaded together
- `slug` is unique within project (enforced by unique constraint)
- `layout` stored as JSONB for flexibility as layout options expand

---

## API Routes

### Authenticated Routes (project context)

**File: `server/routes/project/dashboards.ts`** (new file)

| Method   | Path                                                   | Description                                           |
|----------|--------------------------------------------------------|-------------------------------------------------------|
| `GET`    | `/api/project/:projectId/dashboards`                   | List all dashboards (returns `DashboardSummary[]`)    |
| `GET`    | `/api/project/:projectId/dashboards/:id`               | Get dashboard detail                                  |
| `POST`   | `/api/project/:projectId/dashboards`                   | Create dashboard                                      |
| `PUT`    | `/api/project/:projectId/dashboards/:id`               | Update dashboard metadata (title, slug, logo, layout) |
| `DELETE` | `/api/project/:projectId/dashboards/:id`               | Delete dashboard                                      |
| `POST`   | `/api/project/:projectId/dashboards/:id/items`         | Add item(s) to dashboard                              |
| `PUT`    | `/api/project/:projectId/dashboards/:id/items/:itemId` | Update item (label, order)                            |
| `DELETE` | `/api/project/:projectId/dashboards/:id/items/:itemId` | Remove item                                           |
| `POST`   | `/api/project/:projectId/dashboards/:id/items/reorder` | Bulk reorder items                                    |

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

For **"add all replicants"** (new functionality to build):

1. Extend the selection flow with an "Add all replicants" option (not currently in `SelectVisualizationForSlide`)
2. Client fetches all replicant values
3. Client generates FigureBlock for each (sequentially, with progress UI)
4. Client POSTs each item (or batches them)

The single-item flow matches the slides pattern exactly — the server is just storage. The "add all replicants" option is new work specific to dashboards.

### Public Route (no auth)

**File: `server/routes/public/dashboard.ts`** (new file)

| Method | Path                      | Description                 |
|--------|---------------------------|-----------------------------|
| `GET`  | `/api/d/:projectId/:slug` | Get public dashboard bundle |

Implementation:
1. Connect to project database using `projectId` from URL
2. Query `dashboards` table by `slug`
3. Return `PublicDashboardBundle` with items hydrated for rendering
4. If connection fails or slug not found, return 404

Notes:
- No authentication required
- Uses same project DB connection logic as authenticated routes (extracted into reusable function)

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

```typescript
// Public dashboard route (before auth middleware)
app.use("/api/d/*", corsMiddleware);
app.route("/", routesPublicDashboard);
app.get("/d/:projectId/:slug", (c) => c.html(indexHtml));

// ... auth middleware ...

// Authenticated dashboard routes (after auth, in project routes)
app.route("/", routesDashboards);
```

### Client

```typescript
// app.tsx - add public route only
<Route path="/d/:projectId/:slug" component={PublicDashboard} />

// state/t4_ui.ts - add to TabOption type
type TabOption = "reports" | "decks" | "dashboards" | "visualizations" | ...

// project/index.tsx - add to allTabs array and add Match block
<Match when={projectTab() === "dashboards"}>
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
4. Implement API client functions in `server_actions/`

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
| `client/src/server_actions/dashboards.ts`                     | API client functions     |
| `client/src/components/dashboards/dashboard_list.tsx`         | List page                |
| `client/src/components/dashboards/dashboard_editor.tsx`       | Editor page              |
| `client/src/components/dashboards/create_dashboard_modal.tsx` | Create modal             |
| `client/src/components/dashboards/dashboard_item_list.tsx`    | Sortable item list       |
| `client/src/components/public_viewer/dashboard.tsx`           | Public viewer            |

## Files to Modify

| File                                       | Change                                   |
|--------------------------------------------|------------------------------------------|
| `main.ts`                                  | Register dashboard routes                |
| `client/src/app.tsx`                       | Add public dashboard route               |
| `client/src/state/t4_ui.ts`                | Add `"dashboards"` to `TabOption`        |
| `client/src/components/project/index.tsx`  | Add dashboards tab and Match block       |
| `server/route-tracker.ts`                  | Register new routes                      |

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
