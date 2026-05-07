# PLAN: Shareable Links

## Goal

Enable users to share visualizations, slide decks, and interactive views via public links that work both standalone (direct navigation) and embedded (iframe in external sites).

## Current State

- **No public routes** - All routes require Clerk authentication
- **Email sharing exists** - Slide decks can be exported as PDF and emailed via SendGrid
- **Client-side rendering** - Visualizations rendered with Panther Canvas (client-side)
- **Project-scoped access** - All endpoints check `requireProjectPermission()`

## Requirements

| Feature | Standalone | Embeddable | Notes |
|---------|------------|------------|-------|
| Static visualization | ✓ | ✓ | Single chart/table/map, no interactivity |
| Interactive visualization | ✓ | ✓ | Replicant selection, period filter |
| Slide deck viewer | ✓ | ✓ | Navigate slides, optionally download |
| Report (multi-viz) | ✓ | ✓ | Scroll through multiple visualizations |

## Architecture Options

### Option A: Pre-rendered Static Images

Generate PNG/SVG on share, serve from `/public/assets/{uuid}.png`.

**Pros:** No auth needed, CDN-cacheable, simple
**Cons:** No interactivity, stale data, storage cost

### Option B: Token-Based Dynamic Views (RECOMMENDED)

Generate unique token per share link. Token grants read-only access to specific resource.

```
/share/viz/{token}      → Single visualization
/share/deck/{token}     → Slide deck viewer
/share/report/{token}   → Multi-viz report
```

**Pros:** Dynamic data, revocable, audit trail, scales to all resource types
**Cons:** Token lookup per request, requires public viewer component

### Option C: Project Access Keys

Single read-only key per project. Anyone with key sees entire project.

**Pros:** Simple, one key to manage
**Cons:** All-or-nothing access, less granular

### Option D: OAuth-Style With Permissions

Full share link system with fine-grained permissions, recipient whitelists, password protection.

**Pros:** Most flexible
**Cons:** Complex, overkill for initial launch

## Recommended Approach: Token-Based (Option B)

### Phase 1: Static Visualization View (Quick Win)

**Scope:** Single visualization, full-screen, read-only, no auth required, live data

**Target:** 2-3 days to working prototype

---

#### User Flow

1. **Creator** opens a visualization in the editor
2. Clicks "Share" button in toolbar
3. Modal appears, clicks "Create Link"
4. Server generates token, stores mapping, returns URL
5. Creator copies `https://fastr.example.com/share/viz/abc123`
6. **Viewer** opens that URL (no login required)
7. Page fetches bundled data via token, renders the viz full-screen

---

#### Database Schema

```sql
-- In main database (instance-level, cross-project)
CREATE TABLE share_tokens (
  id VARCHAR PRIMARY KEY,
  token VARCHAR UNIQUE NOT NULL,
  project_id VARCHAR NOT NULL,
  resource_type VARCHAR NOT NULL,  -- 'visualization' | 'slide_deck' | 'report'
  resource_id VARCHAR NOT NULL,
  created_by_email VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,            -- NULL = never expires
  is_revoked BOOLEAN DEFAULT FALSE,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMP
);
CREATE INDEX idx_share_tokens_token ON share_tokens(token);
```

---

#### Backend Implementation

**1. Database functions** (`server/db/instance/share_tokens.ts`)

```typescript
createShareToken(projectId, resourceType, resourceId, createdByEmail) → token
getShareToken(token) → { projectId, resourceType, resourceId } | null
revokeShareToken(token) → void
incrementViewCount(token) → void
```

**2. Public route** (`server/routes/public/share.ts`)

```typescript
GET /share/viz/:token
  → Look up token (reject if expired/revoked)
  → Increment view_count
  → Fetch PO config from project database
  → Fetch results data for that PO's metric
  → Fetch instance structure (indicators, admin areas, etc.)
  → Return bundled JSON
```

**3. Auth bypass** (`server/middleware/auth.ts`)

```typescript
if (c.req.path.startsWith("/share/")) {
  return next();
}
```

**4. Create share endpoint** (`server/routes/project/presentation_objects.ts`)

```typescript
POST /project/presentation_objects/:id/share
  → Generate UUID token
  → Store in share_tokens table
  → Return { token, url }
```

---

#### Frontend Implementation

**1. Route** (`client/src/routes/share.tsx`)

- New route outside the main `<Instance>` wrapper
- No sidebar, no header, no auth check
- Renders `<PublicVisualization token={params.token} />`

**2. Public viewer component** (`client/src/components/public_viewer/visualization.tsx`)

- Fetches `/share/viz/:token` on mount
- Passes data to existing Panther figure renderer
- Full-screen canvas
- Minimal chrome (title + optional "Powered by FASTR" footer)

**3. Share button** - Add to visualization toolbar

- Opens modal with "Create Share Link" button
- Calls `POST /project/presentation_objects/:id/share`
- Shows copyable URL

---

#### Data Bundle Structure

The public endpoint returns everything needed to render:

```typescript
{
  po: PresentationObjectConfig,      // Chart type, title, styling
  resultsData: ResultsValue[],       // The actual numbers
  structure: {
    indicators: Indicator[],         // Metadata for labels
    adminAreas: AdminArea[],         // Geographic names
    facilities: Facility[],          // Facility names
    periods: Period[],               // Time period labels
  }
}
```

The public viewer calls the same `getFigureInputsFromPresentationObject()` function the main app uses.

---

#### Files to Create

| File | Purpose |
|------|---------|
| `server/db/instance/share_tokens.ts` | Token CRUD functions |
| `server/db/migrations/instance/XXX_share_tokens.ts` | Migration |
| `server/routes/public/share.ts` | Public GET endpoint |
| `client/src/routes/share.tsx` | Public route definition |
| `client/src/components/public_viewer/visualization.tsx` | Viewer component |
| `client/src/components/visualization/share_modal.tsx` | Share link modal |

#### Files to Modify

| File | Change |
|------|--------|
| `server/middleware/auth.ts` | Skip auth for `/share/*` |
| `server/routes/project/presentation_objects.ts` | Add POST `.../share` endpoint |
| `client/src/components/visualization/toolbar.tsx` (or equivalent) | Add Share button |
| `client/src/routes/index.tsx` | Add `/share/*` routes |

---

#### Implementation Checklist

**Day 1: Backend**
- [ ] Create `share_tokens` table migration
- [ ] Create `server/db/instance/share_tokens.ts` with CRUD functions
- [ ] Create `server/routes/public/share.ts` with token validation
- [ ] Add `/share/*` bypass to auth middleware
- [ ] Create server function to bundle all data needed for rendering
- [ ] Add `POST /project/presentation_objects/:id/share` endpoint

**Day 2: Frontend**
- [ ] Create `/share/viz/:token` route (outside main app shell)
- [ ] Create `<PublicVisualization />` component
- [ ] Wire up data fetching and Panther rendering
- [ ] Add "Share" button to visualization toolbar
- [ ] Create modal for share link generation/copy

**Day 3: Polish**
- [ ] Error states (invalid token, expired, revoked)
- [ ] Loading states
- [ ] Mobile responsive layout
- [ ] Test iframe embedding
- [ ] View count tracking

### Phase 2: Interactive Visualization

Add optional interactivity to shared visualizations:

- Replicant selector (choose different data slice)
- Period filter (select time range)
- Disaggregation toggle

**Implementation:**
- Store allowed interactions in share token config
- Public viewer fetches additional data on interaction
- Rate limiting on public data endpoints

### Phase 3: Slide Deck Viewer

Full slide deck navigation in browser:

- Arrow key / swipe navigation
- Fullscreen mode
- Optional download button (PDF)
- Presenter notes view (if enabled)

### Phase 4: Embeddable Widgets

Provide embed codes for external sites:

```html
<iframe 
  src="https://fastr.example.com/share/embed/abc123"
  width="800" 
  height="600"
  frameborder="0"
></iframe>
```

Features:
- Responsive sizing
- Theme options (light/dark)
- Attribution toggle

### Phase 5: Advanced Sharing

- Password-protected links
- Email whitelist (only specific recipients can view)
- Expiration dates
- Download restrictions
- Share analytics dashboard

## Quick Win Implementation Plan

**Target: 2-3 days to working prototype**

### Day 1: Backend

- [ ] Create `share_tokens` table and migration
- [ ] Create `server/db/instance/share_tokens.ts` with CRUD functions
- [ ] Create `server/routes/public/share.ts` with token validation
- [ ] Add `/share/*` bypass to auth middleware
- [ ] Create server function to bundle all data needed for rendering

### Day 2: Frontend

- [ ] Create `/share/viz/:token` route (outside main app shell)
- [ ] Create `<PublicVisualization />` component
- [ ] Wire up data fetching and Panther rendering
- [ ] Add "Create Share Link" button to visualization toolbar
- [ ] Create modal for share link generation/copy

### Day 3: Polish

- [ ] Error states (invalid token, expired, revoked)
- [ ] Loading states
- [ ] Mobile responsive layout
- [ ] Test iframe embedding
- [ ] Add view count tracking

## Open Questions

1. **Token format:** UUID vs shorter human-readable (e.g., `abc-123-xyz`)?
2. **Default expiration:** Never, 30 days, or require user to choose?
3. **Revocation UI:** Where should users manage their shared links?
4. **Analytics:** Track views? Show to creator?
5. **Rate limiting:** How aggressive for public endpoints?
6. **Data freshness:** Real-time or cached snapshots?

## Non-Goals (for now)

- Collaborative editing via share links
- Comments/annotations on shared views
- Social sharing (Twitter cards, Open Graph)
- Public search/discovery of shared content
- Monetization/paywall features

## Success Metrics

- Time to generate share link: < 2 seconds
- Public page load time: < 3 seconds
- Embed iframe load time: < 3 seconds
- Zero auth errors on public routes
