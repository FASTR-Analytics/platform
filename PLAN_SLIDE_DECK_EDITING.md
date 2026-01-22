# AI Slide Deck: Add Rich User Editing Layer

## Overview

Evolve the AI slide deck system from AI-only editing of `SimpleSlide[]` to support rich user editing with full `ReportItemConfig` power. Users can click any slide to open an advanced editor (similar to report_item.tsx) with layout manipulation, while AI continues to work with the mixed array.

## Architecture Decision

**Hybrid Type System**: `(SimpleSlide | CustomUserSlide)[]`

- **SimpleSlide**: Current format - AI-friendly, simple fields, auto-layout
- **CustomUserSlide**: Wraps full `ReportItemConfig` with explicit layout trees, rich properties
- **AI handling**: AI sees and edits both types. System prompt updated to explain both formats.
- **Conversion**: SimpleSlide → CustomUserSlide happens on modal open (Approach A). User can simplify back if structure allows.

**User Experience Flow:**

1. User double-clicks slide in grid → Editor modal opens immediately
2. Modal converts: `SimpleSlide → CustomUserSlide` (if not already custom)
3. User edits with full ReportItemConfig power (EditablePageHolder + panel)
4. On save: CustomUserSlide replaces original in array → triggers auto-save
5. On cancel: If no changes made (tracked via needsSave), treat as cancel and keep original SimpleSlide
6. Trade-off accepted: No separate preview mode - editor panel always visible

## Type Definitions

### New Types (lib/types/reports.ts)

```typescript
// Add after SimpleSlide definition (line 105)

export type CustomUserSlide = {
  type: "custom";
  slideType: "cover" | "section" | "freeform";
  config: ReportItemConfig;
  _originalSimpleSlide?: SimpleSlide; // Optional: preserve for reference
};

export type MixedSlide = SimpleSlide | CustomUserSlide;

// Type guards
export function isSimpleSlide(slide: MixedSlide): slide is SimpleSlide {
  return (slide as CustomUserSlide).type !== "custom";
}

export function isCustomUserSlide(slide: MixedSlide): slide is CustomUserSlide {
  return (slide as CustomUserSlide).type === "custom";
}
```

### Update AISlideDeckConfig

```typescript
// Change line 107-110
export type AISlideDeckConfig = {
  label: string;
  version: 1 | 2; // Add version field
  slides: MixedSlide[]; // Was SimpleSlide[]
};
```

## Implementation Plan

### Phase 1: Type Foundation & Conversion Logic

**Files to modify:**
- `lib/types/reports.ts` - Add CustomUserSlide, MixedSlide, type guards, version field
- `client/src/components/project_ai_slide_deck/conversions.ts` (NEW) - Conversion functions

**New file: conversions.ts**

```typescript
// SimpleSlide → CustomUserSlide
export function simpleSlideToCustomUserSlide(slide: SimpleSlide): CustomUserSlide {
  const reportItemConfig = transformSlideToReportItem(slide);
  return {
    type: "custom",
    slideType: slide.type === "content" ? "freeform" : slide.type,
    config: reportItemConfig,
    _originalSimpleSlide: slide,
  };
}

// CustomUserSlide → SimpleSlide (for rendering/AI)
export function customUserSlideToSimpleSlide(customSlide: CustomUserSlide): SimpleSlide {
  return transformReportItemToSlide(customSlide.config, 0);
}

// Attempt to simplify custom slide back to SimpleSlide
// Returns undefined if slide has complex features
export function trySimplifyCustomSlide(customSlide: CustomUserSlide): SimpleSlide | undefined {
  if (customSlide.config.type !== "freeform") {
    return transformReportItemToSlide(customSlide.config, 0);
  }

  const content = customSlide.config.freeform.content;
  if (content.layoutType === "explicit") {
    // Has explicit layout tree - can't simplify
    return undefined;
  }

  // Check for advanced properties
  const hasAdvancedFeatures = content.items.some(item =>
    item.span !== undefined ||
    item.useFigureAdditionalScale ||
    item.textSize !== 1 ||
    item.textBackground !== "none" ||
    item.type === "image" ||
    item.type === "placeholder"
  );

  return hasAdvancedFeatures ? undefined : transformReportItemToSlide(customSlide.config, 0);
}
```

**Reuse existing transform.ts functions:**
- `transformSlideToReportItem()` - Already exists, converts SimpleSlide → ReportItemConfig
- `transformReportItemToSlide()` - Already exists, converts ReportItemConfig → SimpleSlide

### Phase 2: Database & Migration

**Files to modify:**
- `server/db/project/reports.ts` - Add version migration in read functions

**Migration logic:**

```typescript
function migrateAISlideDeckConfig(rawConfig: string): AISlideDeckConfig {
  const parsed = JSON.parse(rawConfig);

  // Already has version field
  if ('version' in parsed) {
    return parsed as AISlideDeckConfig;
  }

  // Legacy format - add version 1
  return {
    ...parsed,
    version: 1,
    slides: parsed.slides, // Already SimpleSlide[]
  };
}
```

**Update functions:**
- `getAllReportsForProject()` - Apply migration
- `getReportDetail()` - Apply migration
- `updateAiSlideDeckContent()` - Accept MixedSlide[], increment version to 2

### Phase 3: AI Integration Updates

**Files to modify:**
- `client/src/components/project_ai_slide_deck/index.tsx` - Update JSON handling
- `client/src/components/ai_prompts/slide_deck.ts` - Update system prompt

**JSON handling (index.tsx):**

Keep it simple - pass the full mixed array to AI as-is. No conversion needed.

```typescript
const [jsonContent, setJsonContent] = createSignal<string>(
  JSON.stringify(config.slides, null, 2)
);

// Parse as MixedSlide[]
const [parsedSlides, setParsedSlides] = createSignal<MixedSlide[]>();

function updateJsonContent(newJson: string) {
  setJsonContent(newJson);
  try {
    const parsed = JSON.parse(newJson) as MixedSlide[];
    setParsedSlides(parsed);
    setJsonError(undefined);
  } catch (e) {
    setJsonError(e.message);
  }
}
```

**System prompt update (slide_deck.ts):**

Add section explaining CustomUserSlide format after SimpleSlide section:

```typescript
## Custom User Slide Format

For slides that users have manually edited with advanced layout features, you'll see slides with `type: "custom"`:

\`\`\`json
{
  "type": "custom",
  "slideType": "cover" | "section" | "freeform",
  "config": {
    // Full ReportItemConfig structure
    "type": "cover" | "section" | "freeform",
    "cover": { /* cover fields */ },
    "section": { /* section fields */ },
    "freeform": {
      "headerText": "Slide heading",
      "content": {
        "layoutType": "explicit" | "optimize",
        "layout": { /* layout tree */ },
        "items": [ /* content items */ ]
      }
    }
  }
}
\`\`\`

**When editing custom slides:**
- You can modify text content in `headerText`, `subHeaderText`, content items
- You can change `figureId` in content items to swap charts
- You can add/remove items in `content.items` array
- Preserve the layout structure unless explicitly asked to change it
- For simple text/content changes, just update the relevant fields

**Converting between formats:**
- To simplify a custom slide to SimpleSlide, replace it with a new SimpleSlide object
- Users may ask you to "simplify slide X" - this removes advanced layout features
```

### Phase 4: Rich Editor Modal Components

**New files to create:**
- `client/src/components/project_ai_slide_deck/slide_editor_modal.tsx` - Modal wrapper
- `client/src/components/project_ai_slide_deck/slide_editor.tsx` - Main editor
- `client/src/components/project_ai_slide_deck/slide_editor_panel.tsx` - Panel router

**Component structure (slide_editor_modal.tsx):**

```typescript
type SlideEditorModalProps = {
  projectId: string;
  reportId: string;
  slide: MixedSlide;
  slideIndex: number;
  totalSlides: number;
  onSave: (updatedSlide: MixedSlide) => Promise<void>;
};

export function SlideEditorModal(p: AlertComponentProps<SlideEditorModalProps, void>) {
  // Track if user made changes
  const [needsSave, setNeedsSave] = createSignal(false);

  async function handleSave(updatedConfig: ReportItemConfig) {
    if (!needsSave()) {
      // No changes made - treat as cancel, keep original SimpleSlide
      p.close(undefined);
      return;
    }

    // Wrap config in CustomUserSlide
    const customSlide: CustomUserSlide = {
      type: "custom",
      slideType: updatedConfig.type === "freeform" ? "freeform" : updatedConfig.type,
      config: updatedConfig,
      _originalSimpleSlide: isSimpleSlide(p.slide) ? p.slide : undefined,
    };

    await p.onSave(customSlide);
    p.close(undefined);
  }

  return <SlideEditor {...} onSave={handleSave} needsSave={[needsSave, setNeedsSave]} />;
}
```

**Main editor (slide_editor.tsx):**

```typescript
export function SlideEditor(p: {
  projectId: string;
  reportId: string;
  initialSlide: MixedSlide;
  slideIndex: number;
  onSave: (slide: MixedSlide) => Promise<APIResponse>;
  onClose: () => void;
}) {
  // Convert to CustomUserSlide if not already
  const initialCustomSlide = createMemo(() =>
    isCustomUserSlide(p.initialSlide)
      ? p.initialSlide
      : simpleSlideToCustomUserSlide(p.initialSlide)
  );

  // Temp state using ReportItemConfig (not the CustomUserSlide wrapper)
  const [tempReportItemConfig, setTempReportItemConfig] =
    createStore<ReportItemConfig>(structuredClone(initialCustomSlide().config));

  // Save status
  const [saveStatus, setSaveStatus] = createSignal<"saved" | "pending" | "saving" | "error">("saved");

  // Track if user made any changes (to treat save-without-changes as cancel)
  const [needsSave, setNeedsSave] = createSignal(false);

  // Page inputs for rendering
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>();

  // Selected item for freeform content
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();

  // Re-render on changes
  createEffect(() => {
    trackStore(tempReportItemConfig);
    setNeedsSave(true); // Mark as needing save on any change
    convertAndRender();
    debouncedAutoSave();
  });

  async function convertAndRender() {
    const inputs = await convertReportItemConfigToPageInputs(unwrap(tempReportItemConfig));
    setPageInputs(inputs);
  }

  return (
    <FrameRightResizable>
      <EditablePageHolder
        pageInputs={pageInputs()?.status === "ready" ? pageInputs()?.data : undefined}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        hoverStyle={{
          fillColor: "rgba(0, 112, 243, 0.1)",
          strokeColor: "rgba(0, 112, 243, 0.8)",
          strokeWidth: 2,
          showLayoutBoundaries: true,
        }}
      />
      <SlideEditorPanel
        tempReportItemConfig={tempReportItemConfig}
        setTempReportItemConfig={setTempReportItemConfig}
        selectedItemId={selectedItemId()}
        setSelectedItemId={setSelectedItemId}
        saveStatus={saveStatus()}
      />
    </FrameRightResizable>
  );
}
```

**Panel (slide_editor_panel.tsx):**

Reuse existing components from `client/src/components/report/`:
- `ReportItemEditorSlideCover` - For cover slides
- `ReportItemEditorSlideSection` - For section slides
- `ReportItemEditorSlideHeaderFooter` - For header/footer
- `ReportItemEditorContent` - For freeform content

Just need thin wrapper to pass props:

```typescript
export function SlideEditorPanel(p: {
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  selectedItemId: string | undefined;
  setSelectedItemId: Setter<string | undefined>;
  saveStatus: SaveStatus;
}) {
  return (
    <div class="flex flex-col h-full">
      {/* Save status */}
      <SaveStatusIndicator status={p.saveStatus} />

      {/* Type selector */}
      <Select
        label="Slide Type"
        options={slideTypeOptions}
        value={p.tempReportItemConfig.type}
        onChange={(v) => p.setTempReportItemConfig("type", v as ReportItemType)}
      />

      {/* Reuse existing report item panels */}
      <Switch>
        <Match when={p.tempReportItemConfig.type === "cover"}>
          <ReportItemEditorSlideCover
            tempReportItemConfig={p.tempReportItemConfig}
            setTempReportItemConfig={p.setTempReportItemConfig}
          />
        </Match>
        <Match when={p.tempReportItemConfig.type === "section"}>
          <ReportItemEditorSlideSection {...} />
        </Match>
        <Match when={p.tempReportItemConfig.type === "freeform"}>
          <ReportItemEditorSlideHeaderFooter {...} />
          <ReportItemEditorContent
            projectId={p.projectId}
            tempReportItemConfig={p.tempReportItemConfig}
            setTempReportItemConfig={p.setTempReportItemConfig}
            selectedItemId={p.selectedItemId}
            setSelectedItemId={p.setSelectedItemId}
          />
        </Match>
      </Switch>
    </div>
  );
}
```

### Phase 5: Integration with Preview

**Files to modify:**
- `client/src/components/project_ai_slide_deck/slide_deck_preview.tsx` - Change modal call
- `client/src/components/project_ai_slide_deck/index.tsx` - Add update handler

**slide_deck_preview.tsx changes:**

Replace `openExpandedView()` (line 188):

```typescript
function openExpandedView() {
  openComponent<SlideEditorModalProps, void>({
    element: SlideEditorModal,
    props: {
      projectId: p.projectId,
      reportId: p.reportId,
      slide: p.slide,
      slideIndex: p.index,
      totalSlides: p.totalSlides,
      onSave: async (updatedSlide) => {
        await p.onSlideUpdate(p.index, updatedSlide);
      },
    },
  });
}
```

Add props:
- `projectId: string`
- `reportId: string`
- `onSlideUpdate: (index: number, slide: MixedSlide) => Promise<void>`

**index.tsx changes:**

Add update handler:

```typescript
async function updateSlideAtIndex(index: number, updatedSlide: MixedSlide) {
  const newSlides = [...parsedSlides()];
  newSlides[index] = updatedSlide;

  // Update local state (optimistic)
  setParsedSlides(newSlides);
  setJsonContent(JSON.stringify(newSlides, null, 2));

  // Trigger auto-save
  setHasUnsavedChanges(true);
}
```

Pass to preview:

```typescript
<SlideDeckPreview
  projectId={p.projectId}
  reportId={p.reportDetail.id}
  slides={parsedSlides()}
  onSlideUpdate={updateSlideAtIndex}
  // ... other props
/>
```

### Phase 6: Rendering Pipeline Updates

**Files to check:**
- `client/src/components/project_ai_slide_deck/transform_v2.ts` - May need updates for CustomUserSlide

**Update convertSlideToPageInputs:**

```typescript
export async function convertSlideToPageInputs(
  projectId: string,
  slide: MixedSlide,
  slideIndex?: number,
): Promise<APIResponseWithData<PageInputs>> {
  // Handle CustomUserSlide
  if (isCustomUserSlide(slide)) {
    return convertReportItemConfigToPageInputs(
      projectId,
      slide.config,
      slideIndex
    );
  }

  // Existing SimpleSlide logic
  // ...
}
```

Add helper:

```typescript
async function convertReportItemConfigToPageInputs(
  projectId: string,
  config: ReportItemConfig,
  slideIndex?: number,
): Promise<APIResponseWithData<PageInputs>> {
  // Use existing report rendering logic
  // Similar to what report_item.tsx does
}
```

### Phase 7: UI Polish

**Visual indicators:**

In `slide_deck_preview.tsx`, add badge for custom slides:

```typescript
<Show when={isCustomUserSlide(p.slide)}>
  <div class="absolute top-2 right-2 bg-primary text-primary-content text-xs px-2 py-1 rounded">
    Custom
  </div>
</Show>
```

**Simplify button:**

In `slide_editor_panel.tsx`, add button:

```typescript
<Show when={canSimplify()}>
  <Button
    onClick={handleSimplify}
    intent="secondary"
  >
    Simplify to Basic Format
  </Button>
</Show>

function canSimplify() {
  const customSlide: CustomUserSlide = {
    type: "custom",
    slideType: tempReportItemConfig.type === "freeform" ? "freeform" : tempReportItemConfig.type,
    config: unwrap(tempReportItemConfig),
  };
  return trySimplifyCustomSlide(customSlide) !== undefined;
}

async function handleSimplify() {
  const simpleSlide = trySimplifyCustomSlide({
    type: "custom",
    slideType: tempReportItemConfig.type === "freeform" ? "freeform" : tempReportItemConfig.type,
    config: unwrap(tempReportItemConfig),
  });

  if (simpleSlide) {
    await p.onSave(simpleSlide);
    p.onClose();
  }
}
```

## Critical Files

### To Modify:
- `lib/types/reports.ts` - Type definitions
- `server/db/project/reports.ts` - Migration logic
- `client/src/components/project_ai_slide_deck/index.tsx` - Update handler
- `client/src/components/project_ai_slide_deck/slide_deck_preview.tsx` - Modal integration
- `client/src/components/project_ai_slide_deck/transform_v2.ts` - Handle CustomUserSlide rendering
- `client/src/components/ai_prompts/slide_deck.ts` - System prompt update

### To Create:
- `client/src/components/project_ai_slide_deck/conversions.ts` - Conversion functions
- `client/src/components/project_ai_slide_deck/slide_editor_modal.tsx` - Modal wrapper
- `client/src/components/project_ai_slide_deck/slide_editor.tsx` - Main editor
- `client/src/components/project_ai_slide_deck/slide_editor_panel.tsx` - Panel router

### To Reuse:
- `client/src/components/report/report_item_editor_panel_slide_cover.tsx`
- `client/src/components/report/report_item_editor_panel_slide_section.tsx`
- `client/src/components/report/report_item_editor_panel_slide_header_footer.tsx`
- `client/src/components/report/report_item_editor_panel_content.tsx`
- `panther/_303_components/charts/editable_page_holder.tsx`

## Testing & Verification

### Manual Tests:

1. **Create new slide deck** → All slides are SimpleSlide (version 1)
2. **Double-click slide** → Opens rich editor, converts to CustomUserSlide
3. **Edit properties** → Auto-saves, see changes in preview
4. **Add/delete content blocks** → Layout updates correctly
5. **Split/merge cells** → Advanced layout features work
6. **Close and reopen** → Changes persisted, editor reopens correctly
7. **Ask AI to edit slide** → AI can modify CustomUserSlide properties
8. **Ask AI to regenerate deck** → AI can create mix of SimpleSlide and CustomUserSlide
9. **Simplify custom slide** → Converts back to SimpleSlide (when possible)
10. **Reorder slides** → Both types work in sortable list

### Edge Cases:

- Empty slide deck
- All SimpleSlide deck (legacy)
- All CustomUserSlide deck
- Mixed deck with both types
- Custom slide with explicit layout tree (can't simplify)
- Concurrent edits (verify lastUpdated tracking)
- Very large slide decks (50+ slides)

### Database Migration:

- Test loading v1 deck (no version field) → Migrates correctly
- Test loading v2 deck (has version field) → No migration needed
- Test saving v1 deck after edit → Upgrades to v2

## Implementation Order

1. **Phase 1** - Types & conversions (foundation)
2. **Phase 2** - Database migration (backward compatibility)
3. **Phase 6** - Rendering pipeline (handle CustomUserSlide in preview)
4. **Phase 4** - Editor components (main UI work)
5. **Phase 5** - Integration (wire everything together)
6. **Phase 3** - AI integration (system prompt, JSON handling)
7. **Phase 7** - Polish (indicators, simplify button)

## Notes

- **No breaking changes**: Version migration handles existing decks
- **Gradual adoption**: Users can keep SimpleSlide or upgrade to CustomUserSlide per slide
- **AI-friendly**: AI can work with both formats, system prompt explains structure
- **Code reuse**: Leverage existing report editor components, no duplication
- **Performance**: Same rendering pipeline as reports, proven to handle complex layouts
