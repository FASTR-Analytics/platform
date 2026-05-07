# PLAN: Shareable Links

## Goal

Public links to view visualizations without authentication.

## Architecture

Token-based key-value store. Client sends data blob, server stores it, server returns it on view.

---

## Phase 1: Static Visualization Sharing

### Step 1: SQL Migration

**Create file:** `server/db/migrations/instance/026_share_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS share_tokens (
  id VARCHAR PRIMARY KEY,
  token VARCHAR UNIQUE NOT NULL,
  resource_type VARCHAR NOT NULL,
  data JSONB NOT NULL,
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  view_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
```

**Update file:** `server/db/migrations/instance/_main_database.sql`

Add the same CREATE TABLE block to the live schema file.

---

### Step 2: Type Definition

**Create file:** `lib/types/share.ts`

```typescript
import type { FigureInputs } from "panther";
import type { IndicatorMetadata, PresentationObjectConfig } from "./mod.ts";

export type ShareVizBundle = {
  label: string;
  strippedFigureInputs: FigureInputs;
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
  };
  geoData?: unknown;
  indicatorMetadata?: IndicatorMetadata[];
};
```

**Update file:** `lib/types/mod.ts`

Add export:
```typescript
export * from "./share.ts";
```

---

### Step 3: DB Functions

**Create file:** `server/db/instance/share_tokens.ts`

```typescript
import { Sql } from "postgres";

export async function createShareToken(
  mainDb: Sql,
  resourceType: string,
  data: unknown,
  createdByEmail: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await mainDb`
    INSERT INTO share_tokens (id, token, resource_type, data, created_by_email)
    VALUES (${id}, ${token}, ${resourceType}, ${JSON.stringify(data)}, ${createdByEmail})
  `;
  return token;
}

export async function getShareTokenData(
  mainDb: Sql,
  token: string,
): Promise<unknown | null> {
  const rows = await mainDb<{ data: unknown }[]>`
    UPDATE share_tokens
    SET view_count = view_count + 1
    WHERE token = ${token}
    RETURNING data
  `;
  return rows.length > 0 ? rows[0].data : null;
}
```

---

### Step 4: Public Route (Server)

**Create file:** `server/routes/public/share.ts`

```typescript
import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { getShareTokenData } from "../../db/instance/share_tokens.ts";

export const routesPublicShare = new Hono();

routesPublicShare.get("/share/viz/:token", async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const data = await getShareTokenData(mainDb, token);
  if (!data) {
    return c.json({ success: false, error: "Not found" }, 404);
  }
  return c.json({ success: true, data });
});
```

---

### Step 5: Create Share Endpoint (Server)

**Create file:** `server/routes/instance/share.ts`

```typescript
import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { createShareToken } from "../../db/instance/share_tokens.ts";
import { requireGlobalPermission, extractGlobalUser } from "../route-helpers.ts";
import type { ShareVizBundle } from "lib";

export const routesShare = new Hono();

routesShare.post("/share/viz", requireGlobalPermission(), async (c) => {
  const user = extractGlobalUser(c);
  const body = await c.req.json<{ bundle: ShareVizBundle }>();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const token = await createShareToken(mainDb, "visualization", body.bundle, user.email);
  const baseUrl = new URL(c.req.url).origin;
  return c.json({ success: true, token, url: `${baseUrl}/share/viz/${token}` });
});
```

---

### Step 6: Register Routes in main.ts

**Update file:** `main.ts`

Add imports at top:
```typescript
import { routesPublicShare } from "./server/routes/public/share.ts";
import { routesShare } from "./server/routes/instance/share.ts";
```

Add public route BEFORE auth middleware (around line 67):
```typescript
// Public routes (no auth)
app.route("/", routesPublicShare);

//@ts-ignore - Clerk middleware types not fully compatible with Hono
app.use("*", authMiddleware);
```

Add authenticated route with other instance routes (around line 110):
```typescript
app.route("/", routesShare);
```

---

### Step 7: Hydration Function for Public Rendering

**Update file:** `client/src/generate_visualization/strip_figure_inputs.ts`

Add new function after existing `hydrateFigureInputsForRendering`:

```typescript
export function hydrateFigureInputsForPublicRendering(
  fi: FigureInputs,
  source: { config: PresentationObjectConfig; metricId: string; formatAs: "percent" | "number" },
  geoData?: unknown,
): FigureInputs {
  let hydrated = fi;

  if ("mapData" in hydrated && hydrated.mapData && !hydrated.mapData.geoData && geoData) {
    hydrated = { ...hydrated, mapData: { ...hydrated.mapData, geoData } };
  }

  const style = getStyleFromPresentationObject(source.config, source.formatAs);
  hydrated = { ...hydrated, style };

  return hydrated;
}
```

---

### Step 8: Client Route

**Update file:** `client/src/app.tsx`

```typescript
import { Router, Route } from "@solidjs/router";
import { Suspense, lazy } from "solid-js";
import "./app.css";
import InstanceLoggedInWrapper from "./routes/index.tsx";

const PublicVisualization = lazy(() => import("./components/public_viewer/visualization.tsx"));

export default function App() {
  return (
    <Router root={(props) => <Suspense>{props.children}</Suspense>}>
      <Route path="/share/viz/:token" component={PublicVisualization} />
      <Route path="/*" component={InstanceLoggedInWrapper} />
    </Router>
  );
}
```

---

### Step 9: Public Viewer Component

**Create file:** `client/src/components/public_viewer/visualization.tsx`

```typescript
import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ChartHolder, FigureInputs } from "panther";
import type { ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

async function fetchBundle(token: string): Promise<ShareVizBundle | null> {
  const res = await fetch(`${_SERVER_HOST}/share/viz/${token}`);
  const json = await res.json();
  if (!json.success) return null;
  return json.data as ShareVizBundle;
}

export default function PublicVisualization() {
  const params = useParams<{ token: string }>();
  const [bundle] = createResource(() => params.token, fetchBundle);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", "flex-direction": "column" }}>
      <Show when={bundle.loading}>
        <div style={{ padding: "20px" }}>Loading...</div>
      </Show>
      <Show when={bundle.error}>
        <div style={{ padding: "20px" }}>Error loading visualization</div>
      </Show>
      <Show when={bundle() === null && !bundle.loading}>
        <div style={{ padding: "20px" }}>Visualization not found</div>
      </Show>
      <Show when={bundle()}>
        {(b) => {
          const fi = hydrateFigureInputsForPublicRendering(
            b().strippedFigureInputs,
            b().source,
            b().geoData,
          );
          return (
            <>
              <div style={{ padding: "12px 20px", "border-bottom": "1px solid #e5e5e5" }}>
                <h1 style={{ margin: 0, "font-size": "18px" }}>{b().label}</h1>
              </div>
              <div style={{ flex: 1 }}>
                <ChartHolder figureInputs={fi} />
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}
```

---

### Step 10: Share Button in Visualization Editor

**Update file:** `client/src/components/visualization/visualization_editor_inner.tsx`

Add import at top:
```typescript
import { stripFigureInputsForStorage } from "~/generate_visualization/strip_figure_inputs";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import type { ShareVizBundle } from "lib";
```

Add share function inside component (where other action handlers are):
```typescript
const handleShare = async () => {
  const fi = currentFigureInputs(); // however current figure inputs are accessed
  if (!fi) return;
  
  const stripped = stripFigureInputsForStorage(fi);
  const mapLevel = getAdminAreaLevelFromMapConfig(config);
  const geoData = mapLevel ? getGeoJsonSync(mapLevel) : undefined;
  
  const bundle: ShareVizBundle = {
    label: poDetail.label,
    strippedFigureInputs: stripped,
    source: {
      config: config,
      metricId: poDetail.metricId,
      formatAs: resultsValueInfo.formatAs,
    },
    geoData,
  };
  
  const res = await fetch(`${_SERVER_HOST}/share/viz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundle }),
  });
  const json = await res.json();
  if (json.success) {
    await navigator.clipboard.writeText(json.url);
    // Show toast: "Link copied to clipboard"
  }
};
```

Add button in toolbar (where other action buttons are):
```typescript
<Button onClick={handleShare}>Share</Button>
```

---

## Files Summary

**Create:**
- `server/db/migrations/instance/026_share_tokens.sql`
- `server/db/instance/share_tokens.ts`
- `server/routes/public/share.ts`
- `server/routes/instance/share.ts`
- `lib/types/share.ts`
- `client/src/components/public_viewer/visualization.tsx`

**Update:**
- `server/db/migrations/instance/_main_database.sql`
- `lib/types/mod.ts`
- `main.ts`
- `client/src/app.tsx`
- `client/src/generate_visualization/strip_figure_inputs.ts`
- `client/src/components/visualization/visualization_editor_inner.tsx`

---

## Future Phases

- Phase 2: Interactive viz (replicant selector)
- Phase 3: Slide deck viewer
- Phase 4: Embed codes
- Phase 5: Expiration, revocation, analytics
