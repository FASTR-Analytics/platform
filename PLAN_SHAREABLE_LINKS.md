# PLAN: Shareable Links

## Goal

Public links to view visualizations without authentication.

---

## Phase 1: Static Visualization Sharing

### Step 1: SQL Migration

**Create:** `server/db/migrations/instance/026_share_tokens.sql`

```sql
CREATE TABLE IF NOT EXISTS share_tokens (
  id VARCHAR PRIMARY KEY,
  token VARCHAR UNIQUE NOT NULL,
  resource_type VARCHAR NOT NULL,
  resource_id VARCHAR NOT NULL,
  data JSONB NOT NULL,
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  view_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_tokens_token ON share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_share_tokens_resource ON share_tokens(resource_type, resource_id);
```

**Update:** `server/db/migrations/instance/_main_database.sql`

Add same CREATE TABLE block.

---

### Step 2: Type Definition

**Create:** `lib/types/share.ts`

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

export type ShareTokenInfo = {
  token: string;
  createdAt: string;
  viewCount: number;
};
```

**Update:** `lib/types/mod.ts`

Add line:
```typescript
export * from "./share.ts";
```

---

### Step 3: DB Functions

**Create:** `server/db/instance/share_tokens.ts`

```typescript
import { Sql } from "postgres";
import type { ShareTokenInfo } from "lib";

export async function createShareToken(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
  data: unknown,
  createdByEmail: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await mainDb`
    INSERT INTO share_tokens (id, token, resource_type, resource_id, data, created_by_email)
    VALUES (${id}, ${token}, ${resourceType}, ${resourceId}, ${JSON.stringify(data)}, ${createdByEmail})
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

export async function listShareTokensForResource(
  mainDb: Sql,
  resourceType: string,
  resourceId: string,
): Promise<ShareTokenInfo[]> {
  const rows = await mainDb<{ token: string; created_at: string; view_count: number }[]>`
    SELECT token, created_at, view_count
    FROM share_tokens
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    ORDER BY created_at DESC
  `;
  return rows.map(r => ({
    token: r.token,
    createdAt: r.created_at,
    viewCount: r.view_count,
  }));
}

export async function deleteShareToken(
  mainDb: Sql,
  token: string,
  createdByEmail: string,
): Promise<boolean> {
  const result = await mainDb`
    DELETE FROM share_tokens
    WHERE token = ${token} AND created_by_email = ${createdByEmail}
  `;
  return result.count > 0;
}
```

---

### Step 4: Public Route (no auth)

**Create:** `server/routes/public/share.ts`

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

### Step 5: Authenticated Routes (create/list/delete)

**Create:** `server/routes/instance/share.ts`

```typescript
import { Hono } from "hono";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  createShareToken,
  listShareTokensForResource,
  deleteShareToken,
} from "../../db/instance/share_tokens.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import type { ShareVizBundle } from "lib";

export const routesShare = new Hono();

// Create share link
routesShare.post("/share/viz", requireGlobalPermission(), async (c) => {
  const body = await c.req.json<{ resourceId: string; bundle: ShareVizBundle }>();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const token = await createShareToken(
    mainDb,
    "visualization",
    body.resourceId,
    body.bundle,
    c.var.globalUser.email,
  );
  const baseUrl = new URL(c.req.url).origin;
  return c.json({ success: true, token, url: `${baseUrl}/share/viz/${token}` });
});

// List share links for a visualization
routesShare.get("/share/viz", requireGlobalPermission(), async (c) => {
  const resourceId = c.req.query("resourceId");
  if (!resourceId) {
    return c.json({ success: false, error: "resourceId required" }, 400);
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const tokens = await listShareTokensForResource(mainDb, "visualization", resourceId);
  return c.json({ success: true, tokens });
});

// Delete share link
routesShare.delete("/share/viz/:token", requireGlobalPermission(), async (c) => {
  const token = c.req.param("token");
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const deleted = await deleteShareToken(mainDb, token, c.var.globalUser.email);
  return c.json({ success: deleted });
});
```

---

### Step 6: Register Routes in main.ts

**Update:** `main.ts`

Add imports after line 47:
```typescript
import { routesPublicShare } from "./server/routes/public/share.ts";
import { routesShare } from "./server/routes/instance/share.ts";
```

Add public route BEFORE `app.use("*", authMiddleware)` (insert at line 70):
```typescript
app.route("/", routesPublicShare);
```

Add authenticated route after other instance routes (around line 111):
```typescript
app.route("/", routesShare);
```

---

### Step 7: Hydration Function

**Update:** `client/src/generate_visualization/strip_figure_inputs.ts`

Add import at top:
```typescript
import type { IndicatorMetadata } from "lib";
```

Add function after `hydrateFigureInputsForRendering`:
```typescript
export function hydrateFigureInputsForPublicRendering(
  fi: FigureInputs,
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
  },
  geoData?: unknown,
  indicatorMetadata?: IndicatorMetadata[],
): FigureInputs {
  let hydrated = fi;

  if ("mapData" in hydrated && hydrated.mapData && !hydrated.mapData.geoData && geoData) {
    hydrated = { ...hydrated, mapData: { ...hydrated.mapData, geoData } };
  }

  const style = getStyleFromPresentationObject(
    source.config,
    source.formatAs,
    undefined,
    indicatorMetadata,
  );
  hydrated = { ...hydrated, style };

  return hydrated;
}
```

---

### Step 8: Client Route

**Update:** `client/src/app.tsx`

Change line 2:
```typescript
// FROM:
import { Suspense } from "solid-js";
// TO:
import { Suspense, lazy } from "solid-js";
```

Add after line 4:
```typescript
const PublicVisualization = lazy(() => import("./components/public_viewer/visualization.tsx"));
```

Change line 9:
```typescript
// FROM:
<Route path="/" component={InstanceLoggedInWrapper} />
// TO:
<Route path="/share/viz/:token" component={PublicVisualization} />
<Route path="/*" component={InstanceLoggedInWrapper} />
```

---

### Step 9: Public Viewer Component

**Create:** `client/src/components/public_viewer/visualization.tsx`

```typescript
import { createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { ChartHolder } from "panther";
import type { ShareVizBundle } from "lib";
import { hydrateFigureInputsForPublicRendering } from "~/generate_visualization/strip_figure_inputs";

async function fetchBundle(token: string): Promise<ShareVizBundle | null> {
  const res = await fetch(`/share/viz/${token}`);
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
      <Show when={bundle.error || (bundle() === null && !bundle.loading)}>
        <div style={{ padding: "20px" }}>Visualization not found</div>
      </Show>
      <Show when={bundle()}>
        {(b) => {
          const fi = hydrateFigureInputsForPublicRendering(
            b().strippedFigureInputs,
            b().source,
            b().geoData,
            b().indicatorMetadata,
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

### Step 10: Share Modal Component

**Create:** `client/src/components/visualization/share_visualization_modal.tsx`

```typescript
import { createResource, createSignal, For, Show } from "solid-js";
import { Button, openAlert } from "panther";
import type { FigureInputs } from "panther";
import type { PresentationObjectConfig, ShareTokenInfo, ShareVizBundle, IndicatorMetadata } from "lib";
import { stripFigureInputsForStorage } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

type Props = {
  presentationObjectId: string;
  label: string;
  config: PresentationObjectConfig;
  metricId: string;
  formatAs: "percent" | "number";
  figureInputs: FigureInputs;
  geoData?: unknown;
  indicatorMetadata?: IndicatorMetadata[];
  close: () => void;
};

async function fetchExistingTokens(resourceId: string): Promise<ShareTokenInfo[]> {
  const res = await fetch(`${_SERVER_HOST}/share/viz?resourceId=${resourceId}`, {
    credentials: "include",
  });
  const json = await res.json();
  return json.success ? json.tokens : [];
}

export function ShareVisualizationModal(p: Props) {
  const [tokens, { refetch }] = createResource(
    () => p.presentationObjectId,
    fetchExistingTokens,
  );
  const [creating, setCreating] = createSignal(false);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);

  const createShareLink = async () => {
    setCreating(true);
    const stripped = stripFigureInputsForStorage(p.figureInputs);
    const bundle: ShareVizBundle = {
      label: p.label,
      strippedFigureInputs: stripped,
      source: {
        config: p.config,
        metricId: p.metricId,
        formatAs: p.formatAs,
      },
      geoData: p.geoData,
      indicatorMetadata: p.indicatorMetadata,
    };

    const res = await fetch(`${_SERVER_HOST}/share/viz`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: p.presentationObjectId, bundle }),
    });
    const json = await res.json();
    setCreating(false);

    if (json.success) {
      await navigator.clipboard.writeText(json.url);
      setCopiedToken(json.token);
      refetch();
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  const deleteToken = async (token: string) => {
    await fetch(`${_SERVER_HOST}/share/viz/${token}`, {
      method: "DELETE",
      credentials: "include",
    });
    refetch();
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/share/viz/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div style={{ padding: "20px", "min-width": "400px" }}>
      <h2 style={{ margin: "0 0 16px 0" }}>Share Visualization</h2>

      <Button onClick={createShareLink} disabled={creating()}>
        {creating() ? "Creating..." : "Create New Share Link"}
      </Button>

      <Show when={tokens() && tokens()!.length > 0}>
        <div style={{ "margin-top": "20px" }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Existing Links</h3>
          <For each={tokens()}>
            {(t) => (
              <div style={{
                display: "flex",
                "align-items": "center",
                gap: "8px",
                padding: "8px",
                "border-bottom": "1px solid #eee",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ "font-size": "12px", color: "#666" }}>
                    Created: {new Date(t.createdAt).toLocaleDateString()}
                    {" · "}
                    Views: {t.viewCount}
                  </div>
                </div>
                <Button onClick={() => copyUrl(t.token)}>
                  {copiedToken() === t.token ? "Copied!" : "Copy"}
                </Button>
                <Button onClick={() => deleteToken(t.token)}>Delete</Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div style={{ "margin-top": "20px", "text-align": "right" }}>
        <Button onClick={p.close}>Close</Button>
      </div>
    </div>
  );
}
```

---

### Step 11: Add Share Button to Visualization Editor

**Update:** `client/src/components/visualization/visualization_editor_inner.tsx`

Add imports after line 50:
```typescript
import { ShareVisualizationModal } from "./share_visualization_modal";
import type { IndicatorMetadata } from "lib";
```

Find the section with action buttons (around line 595-640 where `<FrameTop` and `<Button` appear).

Add this function inside `VisualizationEditorInner` component (around line 350, near other action handlers like `saveAndClose`):
```typescript
const openShareModal = () => {
  const ih = itemsHolder();
  if (ih.status !== "ready") return;
  if (ih.data.ih.status !== "ok") return;

  const figureInputsResult = getFigureInputsFromPresentationObject(
    p.poDetail.resultsValue,
    ih.data.ih,
    ih.data.config,
    ih.data.geoJson,
  );
  if (figureInputsResult.status !== "ready") return;

  openAlert({
    element: ShareVisualizationModal,
    props: {
      presentationObjectId: p.mode === "edit" ? p.poDetail.id : "",
      label: p.poDetail.label,
      config: ih.data.config,
      metricId: p.poDetail.resultsValue.resultsValueId,
      formatAs: p.poDetail.resultsValue.formatAs,
      figureInputs: figureInputsResult.data,
      geoData: ih.data.geoJson,
      indicatorMetadata: ih.data.ih.indicatorMetadata,
    },
  });
};
```

Add Share button in the toolbar section (find existing `<Button` elements around line 604-640, add alongside them):
```typescript
<Show when={p.mode === "edit"}>
  <Button onClick={openShareModal}>Share</Button>
</Show>
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
- `client/src/components/visualization/share_visualization_modal.tsx`

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
- Phase 4: Embed codes + CORS headers
- Phase 5: Expiration, revocation UI, analytics
