# AI Slide Tools Implementation Plan

## Overview

Replace the text-editor-based AI slide editing with structured tools. This enables:
- Per-slide validation
- Atomic operations with animations
- Better multi-user support
- Clearer AI interactions
- Granular undo/redo potential

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI Chat                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Tools: get_deck, get_slide, create_slide, update_slide, │    │
│  │        delete_slides, reorder_slides, update_plan       │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Handlers (Client)                        │
│  - Validate inputs                                               │
│  - Call server actions                                           │
│  - Update local state                                            │
│  - Trigger animations                                            │
│  - Return context to AI                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Server API Routes                             │
│  POST /ai-slides/create                                          │
│  PUT  /ai-slides/:id                                             │
│  DELETE /ai-slides                                               │
│  PUT  /ai-slides/reorder                                         │
│  PUT  /reports/:id/plan                                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Database                                      │
│  reports: { id, config: { label, plan } }                        │
│  slides: { id, report_id, sort_order, config, last_updated } │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Layer

### 1.1 Migration

**File:** `server/db/migrations/project/018_slides.ts`

```sql
CREATE TABLE slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  config JSONB NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX slides_report_id_idx ON slides(report_id);
CREATE INDEX slides_report_sort_idx ON slides(report_id, sort_order);
```

### 1.2 Database Types

**File:** `server/db/project/_project_database_types.ts`

```typescript
export type DBAISlide = {
  id: string;
  report_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
};
```

### 1.3 CRUD Functions

**File:** `server/db/project/slides.ts`

```typescript
// Get all slides for a deck (ordered)
export async function getAISlides(
  projectDb: Sql,
  reportId: string
): Promise<APIResponseWithData<AISlide[]>>

// Get single slide
export async function getAISlide(
  projectDb: Sql,
  slideId: string
): Promise<APIResponseWithData<AISlide>>

// Create slide
export async function createAISlide(
  projectDb: Sql,
  reportId: string,
  afterSlideId: string | null,
  config: MixedSlide
): Promise<APIResponseWithData<{ slide: AISlide; index: number }>>

// Update slide
export async function updateAISlide(
  projectDb: Sql,
  slideId: string,
  config: MixedSlide
): Promise<APIResponseWithData<{ slide: AISlide }>>

// Delete slides
export async function deleteAISlides(
  projectDb: Sql,
  reportId: string,
  slideIds: string[]
): Promise<APIResponseWithData<{ deletedCount: number }>>

// Reorder slides
export async function reorderAISlides(
  projectDb: Sql,
  reportId: string,
  slideIdsInOrder: string[]
): Promise<APIResponseWithData<{ slides: AISlide[] }>>
```

Helper type for API responses:

```typescript
export type AISlide = {
  id: string;
  reportId: string;
  index: number;  // Computed from sort_order position
  config: MixedSlide;
  lastUpdated: string;
};
```

---

## Phase 2: Shared Types

### 2.1 Simplify Slide Types

**File:** `lib/types/slides.ts`

```typescript
// Slide types
export type SlideType = 'cover' | 'section' | 'content';

// Text block
export type TextBlock = {
  type: 'text';
  markdown: string;
};

// Figure block - contains snapshot data, not just reference
export type FigureBlock = {
  type: 'figure';
  figure: FigureSnapshot;           // The actual rendered data
  source?: {                        // Optional: enables "update" button
    presentationObjectId: string;
    replicant?: string;
    snapshotAt: string;
  };
};

// Snapshot contains everything needed to render
export type FigureSnapshot = {
  figureInputs: FigureInputs;       // From panther - chart/table config + data
  caption?: string;
  subCaption?: string;
  footnote?: string;
};

export type ContentBlock = TextBlock | FigureBlock;

// Cover slide
export type CoverSlide = {
  type: 'cover';
  title?: string;
  subtitle?: string;
  presenter?: string;
  date?: string;
};

// Section slide
export type SectionSlide = {
  type: 'section';
  sectionTitle: string;
  sectionSubtitle?: string;
};

// Content slide
export type ContentSlide = {
  type: 'content';
  heading: string;
  blocks: ContentBlock[];
};

// Union type
export type Slide = CoverSlide | SectionSlide | ContentSlide;

// API response shape
export type AISlideWithMeta = {
  id: string;
  index: number;
  slide: Slide;
  lastUpdated: string;
};

// Deck summary (for AI context)
export type DeckSummary = {
  reportId: string;
  label: string;
  plan: string;
  slides: Array<{
    id: string;
    index: number;
    type: SlideType;
    title: string;  // Computed display title
  }>;
  lastUpdated: string;
};
```

### 2.2 Validation Schemas

**File:** `lib/types/slides_validation.ts`

```typescript
import { z } from 'zod';

export const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    markdown: z.string().max(5000),
  }),
  z.object({
    type: z.literal('figure'),
    figureId: z.string().uuid(),
    replicant: z.string().optional(),
  }),
]);

export const CoverSlideSchema = z.object({
  type: z.literal('cover'),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  presenter: z.string().max(200).optional(),
  date: z.string().max(100).optional(),
});

export const SectionSlideSchema = z.object({
  type: z.literal('section'),
  sectionTitle: z.string().min(1).max(200),
  sectionSubtitle: z.string().max(500).optional(),
});

export const ContentSlideSchema = z.object({
  type: z.literal('content'),
  heading: z.string().min(1).max(200),
  blocks: z.array(ContentBlockSchema).max(10),
});

export const SlideSchema = z.discriminatedUnion('type', [
  CoverSlideSchema,
  SectionSlideSchema,
  ContentSlideSchema,
]);

export function validateSlide(slide: unknown): { valid: true; data: Slide } | { valid: false; error: string } {
  const result = SlideSchema.safeParse(slide);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return { valid: false, error: result.error.issues[0]?.message ?? 'Invalid slide' };
}
```

---

## Phase 3: API Routes

### 3.1 Route Definitions

**File:** `lib/api-routes/project/slides.ts`

```typescript
export const aiSlidesRoutes = {
  // Get deck summary (for AI context)
  getDeckSummary: {
    method: 'GET',
    path: '/ai-slides/deck/:report_id',
    params: { report_id: z.string().uuid() },
    response: DeckSummarySchema,
  },

  // Get all slides
  getSlides: {
    method: 'GET',
    path: '/ai-slides/:report_id',
    params: { report_id: z.string().uuid() },
    response: z.array(AISlideWithMetaSchema),
  },

  // Get single slide
  getSlide: {
    method: 'GET',
    path: '/ai-slides/slide/:slide_id',
    params: { slide_id: z.string().uuid() },
    response: AISlideWithMetaSchema,
  },

  // Create slide
  createSlide: {
    method: 'POST',
    path: '/ai-slides/:report_id',
    params: { report_id: z.string().uuid() },
    body: z.object({
      afterSlideId: z.string().uuid().nullable(),
      slide: SlideSchema,
    }),
    response: z.object({
      slide: AISlideWithMetaSchema,
      deckSummary: DeckSummarySchema,
    }),
  },

  // Update slide
  updateSlide: {
    method: 'PUT',
    path: '/ai-slides/slide/:slide_id',
    params: { slide_id: z.string().uuid() },
    body: z.object({ slide: SlideSchema }),
    response: z.object({
      slide: AISlideWithMetaSchema,
    }),
  },

  // Delete slides
  deleteSlides: {
    method: 'DELETE',
    path: '/ai-slides/:report_id',
    params: { report_id: z.string().uuid() },
    body: z.object({ slideIds: z.array(z.string().uuid()) }),
    response: z.object({
      deletedCount: z.number(),
      deckSummary: DeckSummarySchema,
    }),
  },

  // Reorder slides
  reorderSlides: {
    method: 'PUT',
    path: '/ai-slides/:report_id/reorder',
    params: { report_id: z.string().uuid() },
    body: z.object({ slideIdsInOrder: z.array(z.string().uuid()) }),
    response: z.object({
      deckSummary: DeckSummarySchema,
    }),
  },

  // Update plan
  updatePlan: {
    method: 'PUT',
    path: '/ai-slides/:report_id/plan',
    params: { report_id: z.string().uuid() },
    body: z.object({ plan: z.string() }),
    response: z.object({ lastUpdated: z.string() }),
  },
};
```

### 3.2 Server Route Implementation

**File:** `server/routes/project/slides.ts`

Standard Hono route handlers calling the DB functions. Each route:
1. Validates input via zod
2. Calls DB function
3. Sends SSE notification via `notifyLastUpdated`
4. Returns response

---

## Phase 4: Client AI Tools

### 4.1 Tool Organization

Tools follow existing pattern in `client/src/components/ai_tools/`:

```text
ai_tools/
├── ai_tool_definitions.tsx      # getToolsForSlides() - gathers all tools
├── tools/
│   ├── slides.ts                # Slide CRUD tools (new)
│   ├── slide_figures.ts         # Figure snapshot tools (new)
│   ├── modules.ts               # Existing
│   ├── metrics.ts               # Existing
│   └── ...
```

### 4.2 Slide CRUD Tools

**File:** `client/src/components/ai_tools/tools/slides.ts`

```typescript
import { z } from 'zod';

export function createAISlideTools(
  projectId: string,
  reportId: string,
  getDeckState: () => DeckSummary,
  onSlideCreated: (slide: AISlideWithMeta) => void,
  onSlideUpdated: (slide: AISlideWithMeta) => void,
  onSlidesDeleted: (slideIds: string[]) => void,
  onSlidesReordered: (slideIds: string[]) => void,
  onPlanUpdated: (plan: string) => void,
) {
  return [
    {
      name: 'get_deck',
      description: 'Get current deck state including plan and slide outline. Call this first to understand the deck structure.',
      parameters: z.object({}),
      handler: async () => {
        return getDeckState();
      },
    },

    {
      name: 'get_slide',
      description: 'Get full details of a specific slide by ID.',
      parameters: z.object({
        slideId: z.string().describe('The slide ID'),
      }),
      handler: async ({ slideId }) => {
        const res = await serverActions.getAISlide({ projectId, slideId });
        if (!res.success) return { error: res.err };
        return res.data;
      },
    },

    {
      name: 'create_slide',
      description: 'Create a new slide. Returns the created slide and updated deck summary.',
      parameters: z.object({
        afterSlideId: z.string().nullable().describe('Insert after this slide ID, or null for beginning'),
        slide: SlideSchema.describe('The slide content'),
      }),
      handler: async ({ afterSlideId, slide }) => {
        const validation = validateSlide(slide);
        if (!validation.valid) return { error: validation.error };

        const res = await serverActions.createAISlide({
          projectId,
          reportId,
          afterSlideId,
          slide: validation.data,
        });
        if (!res.success) return { error: res.err };

        onSlideCreated(res.data.slide);
        return {
          created: res.data.slide,
          deckSummary: res.data.deckSummary,
        };
      },
    },

    {
      name: 'update_slide',
      description: 'Update an existing slide. Call get_slide first to see current content.',
      parameters: z.object({
        slideId: z.string().describe('The slide ID to update'),
        slide: SlideSchema.describe('The new slide content'),
      }),
      handler: async ({ slideId, slide }) => {
        const validation = validateSlide(slide);
        if (!validation.valid) return { error: validation.error };

        const res = await serverActions.updateAISlide({
          projectId,
          slideId,
          slide: validation.data,
        });
        if (!res.success) return { error: res.err };

        onSlideUpdated(res.data.slide);
        return { updated: res.data.slide };
      },
    },

    {
      name: 'delete_slides',
      description: 'Delete one or more slides by ID.',
      parameters: z.object({
        slideIds: z.array(z.string()).describe('Array of slide IDs to delete'),
      }),
      handler: async ({ slideIds }) => {
        const res = await serverActions.deleteAISlides({
          projectId,
          reportId,
          slideIds,
        });
        if (!res.success) return { error: res.err };

        onSlidesDeleted(slideIds);
        return {
          deletedCount: res.data.deletedCount,
          deckSummary: res.data.deckSummary,
        };
      },
    },

    {
      name: 'reorder_slides',
      description: 'Reorder slides. Provide all slide IDs in the desired order.',
      parameters: z.object({
        slideIdsInOrder: z.array(z.string()).describe('All slide IDs in new order'),
      }),
      handler: async ({ slideIdsInOrder }) => {
        const res = await serverActions.reorderAISlides({
          projectId,
          reportId,
          slideIdsInOrder,
        });
        if (!res.success) return { error: res.err };

        onSlidesReordered(slideIdsInOrder);
        return { deckSummary: res.data.deckSummary };
      },
    },

    {
      name: 'update_plan',
      description: 'Update the deck plan/notes. Use this to maintain working notes about the presentation.',
      parameters: z.object({
        plan: z.string().describe('The new plan content (markdown)'),
      }),
      handler: async ({ plan }) => {
        const res = await serverActions.updateAIPlan({
          projectId,
          reportId,
          plan,
        });
        if (!res.success) return { error: res.err };

        onPlanUpdated(plan);
        return { success: true };
      },
    },
  ];
}
```

---

## Phase 5: Component Updates

### 5.1 Main Component

**File:** `client/src/components/project_ai_slide_deck/index.tsx`

```typescript
export function ProjectAiSlideDeck(p: Props) {
  // State
  const [plan, setPlan] = createSignal(p.initialPlan ?? '');
  const [slides, setSlides] = createStore<AISlideWithMeta[]>(p.initialSlides);
  const [deckVersion, setDeckVersion] = createSignal(0);

  // Computed deck summary for AI
  const deckSummary = createMemo((): DeckSummary => ({
    reportId: p.reportId,
    label: p.reportLabel,
    plan: plan(),
    slides: slides.map(s => ({
      id: s.id,
      index: s.index,
      type: s.slide.type,
      title: getSlideTitle(s.slide),
    })),
    lastUpdated: new Date().toISOString(),
  }));

  // Animation handlers
  function onSlideCreated(slide: AISlideWithMeta) {
    setSlides(produce(draft => {
      draft.splice(slide.index, 0, slide);
      // Reindex
      draft.forEach((s, i) => s.index = i);
    }));
    animateSlideIn(slide.id);
    setDeckVersion(v => v + 1);
  }

  function onSlideUpdated(slide: AISlideWithMeta) {
    setSlides(s => s.id === slide.id, slide);
    pulseSlide(slide.id);
    setDeckVersion(v => v + 1);
  }

  function onSlidesDeleted(slideIds: string[]) {
    const idsSet = new Set(slideIds);
    slideIds.forEach(id => animateSlideOut(id));
    // Wait for animation, then remove
    setTimeout(() => {
      setSlides(slides => slides.filter(s => !idsSet.has(s.id)));
      setSlides(produce(draft => draft.forEach((s, i) => s.index = i)));
      setDeckVersion(v => v + 1);
    }, 300);
  }

  function onSlidesReordered(newOrder: string[]) {
    setSlides(reconcile(
      newOrder.map((id, index) => {
        const existing = slides.find(s => s.id === id)!;
        return { ...existing, index };
      })
    ));
    setDeckVersion(v => v + 1);
  }

  function onPlanUpdated(newPlan: string) {
    setPlan(newPlan);
    setDeckVersion(v => v + 1);
  }

  // AI tools
  const aiTools = createMemo(() =>
    createAISlideTools(
      p.projectDetail.id,
      p.reportId,
      () => deckSummary(),
      onSlideCreated,
      onSlideUpdated,
      onSlidesDeleted,
      onSlidesReordered,
      onPlanUpdated,
    )
  );

  // System prompt with current state
  const systemPrompt = createMemo(() =>
    buildSlideToolsSystemPrompt(deckSummary())
  );

  return (
    <AIChatProvider
      config={{
        sdkClient,
        modelConfig: { model: DEFAULT_ANTHROPIC_MODEL, max_tokens: 4096 },
        tools: aiTools(),
        builtInTools: { webSearch: true },  // No textEditor
        conversationId: `ai-slide-deck-${p.reportId}`,
        enableStreaming: true,
        system: systemPrompt,
      }}
    >
      <ProjectAiSlideDeckInner
        plan={plan()}
        slides={slides}
        onPlanChange={(p) => { setPlan(p); savePlan(p); }}
        onManualSlideEdit={handleManualSlideEdit}
        onManualReorder={handleManualReorder}
        // ...
      />
    </AIChatProvider>
  );
}
```

### 5.2 System Prompt

**File:** `client/src/components/ai_prompts/slide_deck_tools.ts`

```typescript
export function buildSlideToolsSystemPrompt(deck: DeckSummary): string {
  const slideList = deck.slides
    .map(s => `  [${s.id}] #${s.index + 1} ${s.type}: "${s.title}"`)
    .join('\n');

  return `You are an AI assistant helping create slide deck presentations.

## Current Deck: "${deck.label}"

**Plan:**
${deck.plan || '(empty)'}

**Slides (${deck.slides.length}):**
${slideList || '  (no slides yet)'}

## Available Tools

1. **get_deck** - Get full deck state (plan + slide outline)
2. **get_slide(slideId)** - Get full content of a specific slide
3. **create_slide(afterSlideId, slide)** - Create new slide
4. **update_slide(slideId, slide)** - Update existing slide
5. **delete_slides(slideIds)** - Delete slides
6. **reorder_slides(slideIdsInOrder)** - Reorder all slides
7. **update_plan(plan)** - Update deck plan/notes

## Slide Types

**Cover:** \`{ type: "cover", title?, subtitle?, presenter?, date? }\`
**Section:** \`{ type: "section", sectionTitle, sectionSubtitle? }\`
**Content:** \`{ type: "content", heading, blocks: [{ type: "text", markdown } | { type: "figure", figureId, replicant? }] }\`

## Workflow

1. **Before editing:** Call get_slide() to see current content
2. **Creating:** Use create_slide() with afterSlideId=null for start, or specific ID
3. **Bulk operations:** Delete/reorder accept arrays for efficiency
4. **Use the plan:** Keep working notes in the plan field

## Best Practices

- Keep slides focused - one main idea per slide
- Use section slides to organize topics
- Pair figures with brief text commentary
- Maximum 4-5 bullet points per content slide
- Call get_deck periodically if making many changes

## Constraints

- Be evidence-based; don't fabricate statistics
- Keep text concise and scannable
- Acknowledge data limitations when relevant`;
}
```

---

## Phase 6: Multi-User Support

### 6.1 SSE Integration

Add `slides` to the existing SSE notification system.

**File:** `lib/types/project_dirty_states.ts`

```typescript
export type LastUpdateTableName =
  | "datasets"
  | "modules"
  | "presentation_objects"
  | "report_items"
  | "reports"
  | "slides";  // Add

export const _LAST_UPDATE_TABLE_NAMES: LastUpdateTableName[] = [
  "datasets",
  "modules",
  "presentation_objects",
  "report_items",
  "reports",
  "slides",  // Add
];

// In ProjectDirtyStates.lastUpdated, add:
slides: Record<string, string>;
```

**File:** `server/task_management/get_project_dirty_states.ts`

The existing generic loop already handles new tables:
```typescript
for (const tableName of _LAST_UPDATE_TABLE_NAMES) {
  // SELECT id, last_updated FROM ${tableName}
  // Works automatically for slides
}
```

**Total changes:** ~10 lines across 2 files.

### 6.2 SSE Notifications

After any slide operation, notify via existing system:

```typescript
// Server: after any slide operation
notifyLastUpdated(projectId, 'slides', [slideId], lastUpdated);
```

### 6.3 Client SSE Handler

```typescript
function useAISlideSync(reportId: string, onRemoteChange: (event: SlideChangeEvent) => void) {
  const eventSource = useSSE(`/sse/project/${projectId}`);

  createEffect(() => {
    eventSource.addEventListener('slides', (e) => {
      const data = JSON.parse(e.data);
      if (data.reportId !== reportId) return;

      // Notify AI of external change
      injectContextMessage(`[External update: ${data.action}]`);

      // Refresh from server
      refetchSlides();
    });
  });
}
```

### 6.3 Optimistic Locking (Optional)

For conflict detection, add version to deck:

```typescript
// On save, check version
const res = await serverActions.updateAISlide({
  slideId,
  slide,
  expectedVersion: localVersion,
});

if (res.err === 'VERSION_CONFLICT') {
  showConflictDialog(res.currentSlide, localSlide);
}
```

---

## Phase 7: Data Loading

### 7.1 Initial Load

**File:** `client/src/routes/project_ai_slide_deck.tsx` (or wherever route is)

```typescript
export function ProjectAiSlideDeckRoute() {
  const params = useParams();

  const [data] = createResource(
    () => params.reportId,
    async (reportId) => {
      const [reportRes, slidesRes] = await Promise.all([
        serverActions.getReportDetail({ reportId }),
        serverActions.getAISlides({ reportId }),
      ]);
      return {
        report: reportRes.data,
        slides: slidesRes.data,
      };
    }
  );

  return (
    <Show when={data()}>
      {(d) => (
        <ProjectAiSlideDeck
          reportId={params.reportId}
          reportLabel={d().report.config.label}
          initialPlan={d().report.config.plan}
          initialSlides={d().slides}
        />
      )}
    </Show>
  );
}
```

---

## Implementation Order

### Week 1: Foundation
1. [ ] Create `slides` migration
2. [ ] Add database types
3. [ ] Implement CRUD functions in `server/db/project/slides.ts`
4. [ ] Add API route definitions to `lib/api-routes`
5. [ ] Implement server routes in `server/routes/project/slides.ts`
6. [ ] Add server actions in client

### Week 2: Client Integration
7. [ ] Create slide validation schemas
8. [ ] Implement AI tool definitions
9. [ ] Write new system prompt
10. [ ] Update main component to use tools (remove text editor)
11. [ ] Update slide preview to work with new data shape

### Week 3: Polish
12. [ ] Add slide animations (create/update/delete)
13. [ ] Implement SSE sync for multi-user
14. [ ] Add manual slide editing integration
15. [ ] Test AI interactions end-to-end
16. [ ] Handle edge cases (empty deck, validation errors)

---

## Files to Create/Modify

### New Files
- `server/db/migrations/project/018_slides.ts`
- `server/db/project/slides.ts`
- `server/routes/project/slides.ts`
- `lib/types/slides.ts`
- `lib/types/slides_validation.ts`
- `lib/api-routes/project/slides.ts`
- `client/src/components/ai_tools/tools/slides.ts` - slide CRUD tools
- `client/src/components/ai_tools/tools/slide_figures.ts` - figure snapshot tools
- `client/src/components/ai_prompts/slide_deck_tools.ts`

### Modified Files
- `server/db/mod.ts` - export new functions
- `server/routes/project/mod.ts` - register new routes
- `lib/api-routes/mod.ts` - export new route definitions
- `client/src/server_actions/index.ts` - add new actions
- `client/src/components/project_ai_slide_deck/index.tsx` - major rewrite
- `client/src/components/project_ai_slide_deck/slide_deck_preview.tsx` - update data shape
- `client/src/components/ai_tools/ai_tool_definitions.tsx` - update `getToolsForSlides()` to use new tools

### Files to Delete (after migration)
- `client/src/components/project_ai_slide_deck/transform.ts` (if unused)
- Old text-editor related code in slide deck component

---

## Migration Strategy for Existing Data

Since we're not worried about legacy, existing `ai_slide_deck` reports can either:

1. **Ignore:** Old format stays in `reports.config`, new decks use `slides` table
2. **Manual migration:** Provide a one-time script if needed later

Recommend option 1 - just start fresh with new structure.

---

---

## Phase 8: Snapshot Figures

### 8.1 Why Snapshots

Instead of figures referencing live data (presentationObjectId), slides store **snapshots** of fully resolved figure data. This means:

- Slides are self-contained documents
- No dependency on current data state
- AI can create arbitrary figures (not just from existing visualizations)
- "Update" is explicit user action, not automatic
- Large data per slide → reinforces per-slide rows in database

### 8.2 Figure Tools

**File:** `client/src/components/ai_tools/tools/slide_figures.ts`

```typescript
// Add figure from existing visualization (creates snapshot)
{
  name: 'add_figure_from_visualization',
  description: 'Add a figure to a slide by snapshotting an existing visualization.',
  parameters: z.object({
    slideId: z.string(),
    blockIndex: z.number().describe('Index in blocks array to insert at'),
    presentationObjectId: z.string().uuid(),
    replicant: z.string().optional(),
  }),
  handler: async ({ slideId, blockIndex, presentationObjectId, replicant }) => {
    // 1. Fetch and resolve the figure
    const resolved = await serverActions.resolveFigure({
      projectId,
      presentationObjectId,
      replicant,
    });
    if (!resolved.success) return { error: resolved.err };

    // 2. Create snapshot block
    const figureBlock: FigureBlock = {
      type: 'figure',
      figure: resolved.data,
      source: {
        presentationObjectId,
        replicant,
        snapshotAt: new Date().toISOString(),
      },
    };

    // 3. Update slide
    const slide = await getSlide(slideId);
    slide.blocks.splice(blockIndex, 0, figureBlock);
    return updateSlide(slideId, slide);
  },
}

// Refresh a figure from its source
{
  name: 'refresh_figure',
  description: 'Update a figure snapshot from its source visualization.',
  parameters: z.object({
    slideId: z.string(),
    blockIndex: z.number(),
  }),
  handler: async ({ slideId, blockIndex }) => {
    const slide = await getSlide(slideId);
    const block = slide.blocks[blockIndex];

    if (block.type !== 'figure' || !block.source) {
      return { error: 'Block is not a figure with source' };
    }

    const resolved = await serverActions.resolveFigure({
      projectId,
      presentationObjectId: block.source.presentationObjectId,
      replicant: block.source.replicant,
    });
    if (!resolved.success) return { error: resolved.err };

    block.figure = resolved.data;
    block.source.snapshotAt = new Date().toISOString();

    return updateSlide(slideId, slide);
  },
}

// List available visualizations (for AI to choose from)
{
  name: 'list_visualizations',
  description: 'Get list of available visualizations that can be added as figures.',
  parameters: z.object({}),
  handler: async () => {
    const res = await serverActions.getPresentationObjects({ projectId });
    return res.data.map(po => ({
      id: po.id,
      label: po.label,
      type: po.type,
      replicants: po.replicateBy ? po.replicantValues : undefined,
    }));
  },
}
```

### 8.3 Server: Resolve Figure Endpoint

**File:** `server/routes/project/slides.ts`

```typescript
// Resolve a visualization to snapshot data
defineRoute(
  routesAISlides,
  'resolveFigure',
  getProjectViewer,
  async (c, { body }) => {
    const { presentationObjectId, replicant } = body;

    // Get presentation object config
    const po = await getPresentationObject(c.var.ppk.projectDb, presentationObjectId);
    if (!po.success) return c.json(po);

    // Get results data from module
    const results = await getResultsForPO(c.var.ppk.projectDb, po.data);
    if (!results.success) return c.json(results);

    // Build FigureInputs (same as current rendering logic)
    const figureInputs = buildFigureInputs(po.data.config, results.data, replicant);

    const snapshot: FigureSnapshot = {
      figureInputs,
      caption: po.data.config.caption,
      subCaption: po.data.config.subCaption,
      footnote: po.data.config.footnote,
    };

    return c.json({ success: true, data: snapshot });
  }
);
```

### 8.4 Staleness Detection via PDS

Use the existing `ProjectDirtyStates` SSE system to detect stale figures:

```typescript
// Client: check if figure is stale
function isFigureStale(
  figure: FigureBlock,
  pds: ProjectDirtyStates
): boolean {
  if (!figure.source) return false;  // No source = can't be stale

  const poLastUpdated = pds.lastUpdated.presentation_objects[figure.source.presentationObjectId];
  if (!poLastUpdated) return false;

  // Figure is stale if source was updated after snapshot
  return poLastUpdated > figure.source.snapshotAt;
}

// Check all figures in deck
function getStaleFigures(slides: AISlideWithMeta[], pds: ProjectDirtyStates): StaleInfo[] {
  const stale: StaleInfo[] = [];
  for (const slide of slides) {
    if (slide.slide.type !== 'content') continue;
    for (const [blockIndex, block] of slide.slide.blocks.entries()) {
      if (block.type === 'figure' && isFigureStale(block, pds)) {
        stale.push({ slideId: slide.id, blockIndex, source: block.source });
      }
    }
  }
  return stale;
}
```

### 8.5 UI: Figure Freshness Indicator

Each figure block in the slide preview shows:

- Source visualization name (if has source)
- "Snapshot from X days ago"
- Warning badge if stale (source updated since snapshot)
- "Refresh" button (per-figure)

Deck-level toolbar:

- "Refresh all figures" button
- Badge: "3 figures outdated" (computed from pds comparison)

### 8.6 Storage Implications

With snapshot data, `slides.config` can be large:
- Simple text slide: ~1KB
- Slide with 2 charts: ~50-200KB (depending on data points)

This is fine with per-slide rows. Would be problematic with single JSON blob.

### 8.7 Future: AI-Generated Figures

With snapshots, AI could create figures from scratch (not from existing visualizations):

```typescript
{
  name: 'create_custom_chart',
  description: 'Create a chart from data you provide.',
  parameters: z.object({
    slideId: z.string(),
    chartConfig: ChartConfigSchema,
    data: z.array(DataPointSchema),
  }),
  handler: async ({ slideId, chartConfig, data }) => {
    const figureInputs = buildChartFromSpec(chartConfig, data);
    const block: FigureBlock = {
      type: 'figure',
      figure: { figureInputs },
      source: undefined,  // No source - AI created it
    };
    // Add to slide...
  },
}
```

This allows AI to create charts from:
- Web search results
- Calculations it performs
- Data it synthesizes

**Defer this to v2** - start with snapshot-from-visualization only.

---

## Final Design Decisions

### Figure Model (LOCKED IN)

**Storage:**
```typescript
type FigureSource =
  | {
      type: 'from_metric';
      metricId: string;
      config: PresentationObjectConfig;  // Full config - preserves all styling
      snapshotAt: string;
      clonedFromVisualizationId?: string;
    }
  | {
      type: 'custom';
      description?: string;
    };

type FigureBlock = {
  type: 'figure';
  figureInputs: FigureInputs;
  source?: FigureSource;
};
```

**AI Input (simple):**
- Clone: `{ visualizationId: 'abc-123', replicant?: 'anc1' }`
- Custom metric: `{ metricId: 'xyz', disaggregations: [...], filters: [...], chartType: 'bar' }`
- Arbitrary: `{ customData: [...], chartType: 'bar' }`

**Handler Optimizations:**
1. Clone from PO → store full PresentationObjectConfig (preserves styling)
2. Custom from metric → build minimal PresentationObjectConfig with defaults
3. Auto-detect replicant: if filter has 1 value on metric's `replicateBy` dimension → promote to `selectedReplicantValue`

**Benefits:**
- AI never sees PresentationObjectConfig complexity
- Storage preserves full fidelity
- User can switch replicants in UI
- Custom styling preserved when cloning

### Other Decisions

1. **Per-slide storage:** Individual rows in `slides` table (~50-200KB/slide with snapshots)
2. **Figure staleness:** Compare `snapshotAt` vs `pds.lastUpdated.modules[metricId's module]`
3. **Refresh:** Re-query with stored config, rebuild FigureInputs
4. **No legacy:** Breaking changes, old AI slide decks won't work

## Implementation Status

✅ Phase 1-3 Complete:
- Database: `slides` table, CRUD functions, SSE integration
- Types: `lib/types/slides.ts`, validation schemas
- API: Route definitions, server handlers registered

## Next Steps

1. Client AI tools (slides CRUD)
2. Figure resolution logic
3. Component updates
4. System prompt
