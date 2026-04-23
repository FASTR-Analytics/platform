# Plan: Instance-Level Report to Slides Migration

Migrate old `slide_deck` type reports to the new slides system via an instance-level client-side button. One click per instance, 30 total clicks, then remove the button.

---

## Data Analysis (2026-04-23)

Exported and analyzed all production data:

| Metric | Value |
|--------|-------|
| **Total reports** | 539 |
| **Total report items** | 15,160 |
| **Instances** | 31 |
| **Format** | 100% legacy (2D array), 0% modern (LayoutNode) |

### Item Type Distribution

| Type | Count |
|------|-------|
| Cover | 448 |
| Section | 1,199 |
| Freeform | 13,513 |

### Content Block Distribution (within Freeform)

| Type | Count |
|------|-------|
| Text | 12,527 |
| Figure | 13,070 |
| Image | 814 |
| Placeholder | 1,337 |

### Figure Stats

| Metric | Count |
|--------|-------|
| With PO info | 13,050 |
| Without PO info | 20 |
| Items with span | 7,409 |
| **Span overflow (>12)** | **3** |

⚠️ **3 items have row spans summing to 14** — must call `normalizeLayout()` during migration.

---

## Type Mapping: ReportItemContentItem → ContentBlock

### Source Type: `ReportItemContentItem`

```typescript
// lib/types/reports.ts
export type ReportItemContentItem = {
  type: ReportItemContentItemType;           // "text" | "figure" | "image"
  span: number | undefined;                   // → LayoutNode.span
  presentationObjectInReportInfo: PresentationObjectInReportInfo | undefined;
  markdown: string | undefined;
  stretch: boolean;                           // DROPPED - layout hint
  fillArea: boolean;                          // DROPPED - layout hint
  textSize: number;
  textBackground: string;
  useFigureAdditionalScale: boolean;
  figureAdditionalScale: number | undefined;
  imgFile: string | undefined;
  imgHeight: number | undefined;              // DROPPED - use imgFit instead
  imgFit: "cover" | "inside";
  imgStretch: boolean;                        // DROPPED - use imgFit instead
  hideFigureCaption: boolean;
  hideFigureSubCaption: boolean;
  hideFigureFootnote: boolean;
};

// Additional fields found in production data (not in TypeScript type):
// - placeholderStretch: boolean    (on placeholder type)
// - placeholderHeight: number      (on placeholder type)
```

### Source Type: `PresentationObjectInReportInfo`

```typescript
// lib/types/presentation_objects.ts
export type PresentationObjectInReportInfo = {
  id: string;                                  // Used to fetch PO detail
  metricId: string;                            // → FigureSource.metricId
  isDefault: boolean;                          // Informational only
  replicateBy: DisaggregationOption | undefined;  // Derived from config.d.disaggregateBy
  selectedReplicantValue: string;              // → override, applied to config
};
```

### Target Type: `ContentBlock`

```typescript
// lib/types/slides.ts
export type ContentBlock = TextBlock | FigureBlock | ImageBlock;

export type TextBlock = {
  type: "text";
  markdown: string;
  style?: TextBlockStyle;
};

export type TextBlockStyle = {
  textSize?: number;
  textBackground?: string;
};

export type FigureBlock = {
  type: "figure";
  figureInputs?: FigureInputs;
  source?: FigureSource;
};

export type FigureSource = {
  type: "from_data";
  metricId: string;
  config: PresentationObjectConfig;    // Full config snapshot with overrides applied
  snapshotAt: string;
} | {
  type: "custom";
  description?: string;
};

export type ImageBlock = {
  type: "image";
  imgFile: string;
  style?: ImageBlockStyle;
};

export type ImageBlockStyle = {
  imgFit?: "cover" | "contain";
  imgAlign?: "center" | "top" | "bottom" | "left" | "right";
};
```

### Complete Field Mapping Table

| Source Field | Target Location | Transform | Notes |
|--------------|-----------------|-----------|-------|
| `type: "text"` | `TextBlock.type` | Direct | |
| `type: "figure"` | `FigureBlock.type` | Direct | |
| `type: "image"` | `ImageBlock.type` | Direct | |
| `type: "placeholder"` | `TextBlock.type` | Convert to `"text"` | Legacy adapter handles |
| `span` | `LayoutNode.span` | Direct | On wrapper, not data |
| `markdown` | `TextBlock.markdown` | `?? ""` | Default to empty |
| `textSize` | `TextBlock.style.textSize` | Direct | |
| `textBackground` | `TextBlock.style.textBackground` | Filter `"none"` → `undefined` | |
| `imgFile` | `ImageBlock.imgFile` | `?? ""` | Default to empty |
| `imgFit: "inside"` | `ImageBlock.style.imgFit` | → `"contain"` | |
| `imgFit: "cover"` | `ImageBlock.style.imgFit` | → `"cover"` | |
| `presentationObjectInReportInfo.id` | (fetch key) | Used to call `getPODetailFromCacheorFetch` | Not stored |
| `presentationObjectInReportInfo.metricId` | `FigureSource.metricId` | Direct | |
| `presentationObjectInReportInfo.selectedReplicantValue` | `FigureSource.config.d.selectedReplicantValue` | Applied to cloned config | |
| `presentationObjectInReportInfo.replicateBy` | (derived) | Exists in `config.d.disaggregateBy` | Not stored separately |
| `presentationObjectInReportInfo.isDefault` | — | Dropped | Informational only |
| `useFigureAdditionalScale` | (fetch param) | Used in `ReplicantValueOverride.additionalScale` | Not stored |
| `figureAdditionalScale` | (fetch param) | Used if `useFigureAdditionalScale` is true | Not stored |
| `hideFigureCaption` | `FigureSource.config.t.caption` | Set to `""` if true | |
| `hideFigureSubCaption` | `FigureSource.config.t.subCaption` | Set to `""` if true | |
| `hideFigureFootnote` | `FigureSource.config.t.footnote` | Set to `""` if true | |
| `stretch` | — | **DROPPED** | Layout hint, not needed |
| `fillArea` | — | **DROPPED** | Layout hint, not needed |
| `imgHeight` | — | **DROPPED** | New system uses imgFit |
| `imgStretch` | — | **DROPPED** | New system uses imgFit |
| `placeholderStretch` | — | **DROPPED** | Placeholder → text |
| `placeholderHeight` | — | **DROPPED** | Placeholder → text |

### Conversion Code

#### Text Block

```typescript
case "text": {
  const block: TextBlock = {
    type: "text",
    markdown: item.markdown ?? "",
    style: {
      textSize: item.textSize,
      textBackground: item.textBackground !== "none" ? item.textBackground : undefined,
    },
  };
  return block;
}
```

#### Image Block

```typescript
case "image": {
  const block: ImageBlock = {
    type: "image",
    imgFile: item.imgFile ?? "",
    style: {
      imgFit: item.imgFit === "inside" ? "contain" : "cover",
    },
  };
  return block;
}
```

#### Figure Block

```typescript
case "figure": {
  const poInfo = item.presentationObjectInReportInfo;
  if (!poInfo) {
    return { type: "text", markdown: "[Empty figure]" };
  }

  // Fetch PO detail to get config
  const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
  if (!poDetailRes.success) {
    addLog(`Figure PO not found: ${poInfo.id}`);
    return { type: "text", markdown: "[Missing figure]" };
  }

  // Build override for fetching figure inputs
  const override: ReplicantValueOverride = {
    selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
    additionalScale: item.useFigureAdditionalScale
      ? item.figureAdditionalScale ?? undefined
      : undefined,
    hideFigureCaption: item.hideFigureCaption,
    hideFigureSubCaption: item.hideFigureSubCaption,
    hideFigureFootnote: item.hideFigureFootnote,
  };

  // Clone config and apply overrides for storage
  const configForSource: PresentationObjectConfig = structuredClone(poDetailRes.data.config);
  if (override.selectedReplicantValue) {
    configForSource.d.selectedReplicantValue = override.selectedReplicantValue;
  }
  if (override.hideFigureCaption) {
    configForSource.t.caption = "";
  }
  if (override.hideFigureSubCaption) {
    configForSource.t.subCaption = "";
  }
  if (override.hideFigureFootnote) {
    configForSource.t.footnote = "";
  }

  // Create source for refresh capability
  const source: FigureSource = {
    type: "from_data",
    metricId: poInfo.metricId,
    config: configForSource,
    snapshotAt: new Date().toISOString(),
  };

  // Fetch rendered figure data
  const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
    projectId,
    poInfo.id,
    override
  );

  // Strip style and geoData before storage
  const block: FigureBlock = {
    type: "figure",
    figureInputs: figureInputsRes.success
      ? stripFigureInputsForStorage(figureInputsRes.data)
      : undefined,
    source,
  };

  if (!figureInputsRes.success) {
    addLog(`Figure render failed for PO ${poInfo.id}: ${figureInputsRes.err}`);
  }

  return block;
}
```

#### LayoutNode Conversion (preserves span, then normalized)

After conversion, `normalizeLayout(layout, 12)` is called to fix any rows with spans > 12.

```typescript
async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  addLog: LogCallback
): Promise<LayoutNode<ContentBlock>> {
  if (node.type === "item") {
    const block = await convertContentItem(node.data, projectId, addLog);
    return {
      type: "item",
      id: node.id,
      data: block,
      span: node.span,  // PRESERVED from source
    };
  }

  const children = await Promise.all(
    (node.children ?? []).map((child) => convertLayoutNode(child, projectId, addLog))
  );
  return {
    type: node.type,
    id: node.id,
    children,
    span: node.span,  // PRESERVED from source
  };
}
```

---

## ReportConfig → SlideDeckConfig Mapping

### Source Type

```typescript
// lib/types/reports.ts
export type ReportConfig = {
  label: string;
  selectedReplicantValue: undefined | string;
  logos: string[] | undefined;
  logoSize: number;
  figureScale: number;
  footer: string;
  showPageNumbers: boolean;
  headerSize: number;
  useWatermark: boolean;
  watermarkText: string;
  colorTheme: ColorTheme;
  overlay: "dots" | "none" | undefined;
};
```

### Target Type

```typescript
// lib/types/slides.ts
export type SlideDeckConfig = {
  label: string;
  selectedReplicantValue: undefined | string;
  logos: string[] | undefined;
  logoSize: number;
  figureScale: number;
  deckFooter: DeckFooterConfig | undefined;
  showPageNumbers: boolean;
  headerSize: number;
  useWatermark: boolean;
  watermarkText: string;
  primaryColor: string;
  overlay: "dots" | "rivers" | "waves" | "world" | "none" | undefined;
};
```

### Conversion Code

```typescript
function mapReportConfigToSlideDeckConfig(rc: ReportConfig): SlideDeckConfig {
  const colorDetails = getColorDetailsForColorTheme(rc.colorTheme);
  return {
    label: rc.label,
    selectedReplicantValue: rc.selectedReplicantValue,
    logos: rc.logos,
    logoSize: rc.logoSize,
    figureScale: rc.figureScale,
    deckFooter: rc.footer ? { text: rc.footer, logos: [] } : undefined,
    showPageNumbers: rc.showPageNumbers,
    headerSize: rc.headerSize,
    useWatermark: rc.useWatermark,
    watermarkText: rc.watermarkText,
    primaryColor: colorDetails.primaryBackgroundColor,  // Derived from colorTheme
    overlay: rc.overlay,
  };
}
```

---

## Legacy Data Adapter

All production data uses the legacy 2D array format. The server applies `adaptLegacyReportItemConfigShape` at read time in `backupReport()`.

```typescript
// lib/types/reports.ts
export function adaptLegacyReportItemConfigShape(
  config: LegacyReportItemConfig,
): ReportItemConfig {
  let content: LayoutNode<ReportItemContentItem>;
  
  // Legacy: content is ReportItemContentItem[][] (2D array of rows/cols)
  if (Array.isArray(config.freeform?.content)) {
    content = {
      type: "rows" as const,
      id: crypto.randomUUID(),
      children: config.freeform.content.map((row) => ({
        type: "cols" as const,
        id: crypto.randomUUID(),
        children: row.map((item) => ({
          type: "item" as const,
          id: crypto.randomUUID(),
          data: item,
          span: item.span,  // Copy span from data to node wrapper
        })),
      })),
    };
  } else {
    // Modern: content is already LayoutNode<ReportItemContentItem>
    content = config.freeform.content;
  }

  // Convert legacy "placeholder" type to "text"
  _walkReportItemLayoutTree(content, (item: ReportItemContentItem) => {
    if ((item as unknown as { type: string }).type === "placeholder") {
      item.type = "text";
      item.markdown = "";
    }
  });

  return {
    ...config,
    freeform: {
      ...config.freeform,
      content,
    },
  } as ReportItemConfig;
}
```

---

## Current State

**Existing migration component:** `client/src/components/project/migrate_reports_to_slides.tsx`

Current flow:
1. Takes `ProjectDetail` as prop (includes `reports: ReportSummary[]`)
2. Filters for `reportType === "slide_deck"`
3. Creates "Old reports" folder via `serverActions.createSlideDeckFolder()`
4. For each report:
   - Calls `serverActions.backupReport()` to get full report data (applies legacy adapter)
   - Creates slide deck with converted config
   - Creates slides for each report item
   - For figures: calls `getPOFigureInputsFromCacheOrFetch()` then `stripFigureInputsForStorage()`

**Button location:** `client/src/components/project/project_settings.tsx` lines 341-353

---

## Goal

Move migration button to instance level so one click migrates all projects in the instance.

---

## Implementation

### Step 1: Create Instance-Level Migration Component

**File:** `client/src/components/instance/migrate_all_reports_to_slides.tsx`

```tsx
import { t3 } from "lib";
import type { ProjectDetail, ProjectSummary, SlideDeckFolder } from "lib";
import { Button, EditorComponentProps, ModalContainer, toPct0, toPct1 } from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { migrateProjectReports } from "./migrate_project_reports";

type Props = {};

export function MigrateAllReportsToSlides(
  p: EditorComponentProps<Props, undefined>
) {
  const [phase, setPhase] = createSignal<"ready" | "running" | "done">("ready");
  const [currentProject, setCurrentProject] = createSignal("");
  const [projectProgress, setProjectProgress] = createSignal({ current: 0, total: 0 });
  const [itemProgress, setItemProgress] = createSignal({ current: 0, total: 0 });
  const [log, setLog] = createSignal<string[]>([]);
  const [errors, setErrors] = createSignal<string[]>([]);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  function addError(msg: string) {
    setErrors((prev) => [...prev, msg]);
  }

  async function runMigration() {
    setPhase("running");
    const projects = instanceState.projects.filter((p) => p.status === "ready");
    setProjectProgress({ current: 0, total: projects.length });

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      setCurrentProject(project.label);
      setProjectProgress({ current: i + 1, total: projects.length });

      try {
        // Fetch full project detail
        const detailRes = await serverActions.getProjectDetail({ projectId: project.id });
        if (!detailRes.success) {
          addError(`${project.label}: Failed to fetch project detail`);
          continue;
        }
        const projectDetail = detailRes.data;

        // Check if already migrated (folder named "Old reports" or "Anciens rapports" exists)
        const alreadyMigrated = projectDetail.slideDeckFolders.some(
          (f) => f.label === "Old reports" || f.label === "Anciens rapports"
        );
        if (alreadyMigrated) {
          addLog(`${project.label}: Already migrated, skipping`);
          continue;
        }

        // Count slide_deck reports
        const slideDeckReports = projectDetail.reports.filter(
          (r) => r.reportType === "slide_deck"
        );
        if (slideDeckReports.length === 0) {
          addLog(`${project.label}: No slide_deck reports, skipping`);
          continue;
        }

        // Run migration for this project
        const result = await migrateProjectReports(
          projectDetail,
          (current, total) => setItemProgress({ current, total }),
          addLog,
          addError
        );

        addLog(`${project.label}: Migrated ${result.migratedCount} reports`);
      } catch (e) {
        addError(`${project.label}: ${e instanceof Error ? e.message : "Unknown error"}`);
      }
    }

    setPhase("done");
    addLog("Migration complete!");
  }

  const overallPct = () => {
    const pp = projectProgress();
    if (pp.total === 0) return 0;
    const projectPct = (pp.current - 1) / pp.total;
    const ip = itemProgress();
    const itemPct = ip.total > 0 ? ip.current / ip.total / pp.total : 0;
    return projectPct + itemPct;
  };

  return (
    <ModalContainer
      title={t3({
        en: "Migrate all reports to slides",
        fr: "Migrer tous les rapports vers les diapositives",
      })}
      width="md"
      leftButtons={
        phase() === "done"
          ? [
              <Button onClick={() => p.close(undefined)} intent="primary">
                {t3({ en: "Done", fr: "Terminé" })}
              </Button>,
            ]
          : phase() === "ready"
            ? [
                <Button onClick={runMigration} intent="success">
                  {t3({ en: "Start migration", fr: "Démarrer la migration" })}
                </Button>,
                <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
                  {t3({ en: "Cancel", fr: "Annuler" })}
                </Button>,
              ]
            : undefined
      }
    >
      <div class="ui-spy-sm">
        <Show when={phase() === "ready"}>
          <div>
            {t3({
              en: `This will migrate all slide_deck reports across ${instanceState.projects.length} projects. Projects with an existing "Old reports" folder will be skipped.`,
              fr: `Ceci migrera tous les rapports de type présentation sur ${instanceState.projects.length} projets. Les projets avec un dossier "Anciens rapports" existant seront ignorés.`,
            })}
          </div>
        </Show>

        <Show when={phase() === "running"}>
          <div class="ui-spy-sm">
            <div class="font-600">
              {t3({ en: "Project", fr: "Projet" })}: {currentProject()} ({projectProgress().current}/{projectProgress().total})
            </div>
            <div class="bg-base-300 h-4 w-full rounded">
              <div
                class="bg-primary h-full rounded transition-all"
                style={{ width: toPct1(overallPct()) }}
              />
            </div>
            <Show when={itemProgress().total > 0}>
              <div class="text-neutral text-sm">
                {t3({ en: "Item", fr: "Élément" })}: {itemProgress().current}/{itemProgress().total}
              </div>
            </Show>
          </div>
        </Show>

        <Show when={log().length > 0}>
          <div class="border-base-300 max-h-48 overflow-y-auto rounded border p-2">
            <For each={log()}>{(msg) => <div class="text-sm">{msg}</div>}</For>
          </div>
        </Show>

        <Show when={errors().length > 0}>
          <div class="border-danger max-h-32 overflow-y-auto rounded border p-2">
            <For each={errors()}>
              {(msg) => <div class="text-danger text-sm">{msg}</div>}
            </For>
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
```

### Step 2: Extract Reusable Migration Logic

**File:** `client/src/components/instance/migrate_project_reports.ts`

```typescript
import type {
  ProjectDetail,
  ReportConfig,
  ReportItem,
  SlideDeckConfig,
  Slide,
  CoverSlide,
  SectionSlide,
  ContentSlide,
  ContentBlock,
  FigureBlock,
  TextBlock,
  ImageBlock,
  FigureSource,
  ReportItemContentItem,
  PresentationObjectConfig,
  ReplicantValueOverride,
} from "lib";
import { getColorDetailsForColorTheme, t3 } from "lib";
import type { LayoutNode } from "@timroberton/panther";
import { normalizeLayout } from "@timroberton/panther";
import { serverActions } from "~/server_actions";
import {
  getPODetailFromCacheorFetch,
  getPOFigureInputsFromCacheOrFetch,
} from "~/state/po_cache";
import { stripFigureInputsForStorage } from "~/generate_visualization/mod";

type ProgressCallback = (current: number, total: number) => void;
type LogCallback = (msg: string) => void;

export async function migrateProjectReports(
  projectDetail: ProjectDetail,
  onItemProgress: ProgressCallback,
  addLog: LogCallback,
  addError: LogCallback
): Promise<{ migratedCount: number }> {
  const projectId = projectDetail.id;
  const reports = projectDetail.reports.filter((r) => r.reportType === "slide_deck");

  if (reports.length === 0) {
    return { migratedCount: 0 };
  }

  // Create "Old reports" folder
  const folderRes = await serverActions.createSlideDeckFolder({
    projectId,
    label: t3({ en: "Old reports", fr: "Anciens rapports" }),
  });
  if (!folderRes.success) {
    throw new Error("Failed to create folder: " + folderRes.err);
  }
  const folderId = folderRes.data.folderId;

  // Gather all report data first
  let totalItems = 0;
  const reportDataList: {
    report: { config: ReportConfig; label: string };
    items: ReportItem[];
    itemIdsInOrder: string[];
  }[] = [];

  for (const report of reports) {
    const backupRes = await serverActions.backupReport({
      projectId,
      report_id: report.id,
    });
    if (!backupRes.success) {
      addError(`Skipping report "${report.label}": ${backupRes.err}`);
      continue;
    }
    const { report: reportDetail, reportItems } = backupRes.data;
    totalItems += reportDetail.itemIdsInOrder.length;
    reportDataList.push({
      report: { config: reportDetail.config, label: reportDetail.config.label },
      items: reportItems,
      itemIdsInOrder: reportDetail.itemIdsInOrder,
    });
  }

  let processedItems = 0;

  for (const { report, items, itemIdsInOrder } of reportDataList) {
    const deckRes = await serverActions.createSlideDeck({
      projectId,
      label: report.label || "Untitled",
      folderId,
    });
    if (!deckRes.success) {
      addError(`Failed to create deck for "${report.label}": ${deckRes.err}`);
      continue;
    }
    const deckId = deckRes.data.deckId;

    const slideDeckConfig = mapReportConfigToSlideDeckConfig(report.config);
    await serverActions.updateSlideDeckConfig({
      projectId,
      deck_id: deckId,
      config: slideDeckConfig,
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));

    for (const itemId of itemIdsInOrder) {
      const item = itemMap.get(itemId);
      if (!item) {
        processedItems++;
        onItemProgress(processedItems, totalItems);
        continue;
      }

      const slide = await convertReportItemToSlide(item, projectId, addLog);

      await serverActions.createSlide({
        projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide,
      });

      processedItems++;
      onItemProgress(processedItems, totalItems);
    }
  }

  return { migratedCount: reportDataList.length };
}

// =============================================================================
// ReportConfig → SlideDeckConfig
// =============================================================================

function mapReportConfigToSlideDeckConfig(rc: ReportConfig): SlideDeckConfig {
  const colorDetails = getColorDetailsForColorTheme(rc.colorTheme);
  return {
    label: rc.label,
    selectedReplicantValue: rc.selectedReplicantValue,
    logos: rc.logos,
    logoSize: rc.logoSize,
    figureScale: rc.figureScale,
    deckFooter: rc.footer ? { text: rc.footer, logos: [] } : undefined,
    showPageNumbers: rc.showPageNumbers,
    headerSize: rc.headerSize,
    useWatermark: rc.useWatermark,
    watermarkText: rc.watermarkText,
    primaryColor: colorDetails.primaryBackgroundColor,
    overlay: rc.overlay,
  };
}

// =============================================================================
// ReportItem → Slide
// =============================================================================

async function convertReportItemToSlide(
  item: ReportItem,
  projectId: string,
  addLog: LogCallback
): Promise<Slide> {
  const c = item.config;

  switch (c.type) {
    case "cover": {
      const slide: CoverSlide = {
        type: "cover",
        title: c.cover.titleText ?? "",
        subtitle: c.cover.subTitleText,
        presenter: c.cover.presenterText,
        date: c.cover.dateText,
        logos: c.cover.logos,
        titleTextRelFontSize: c.cover.titleTextRelFontSize,
        subTitleTextRelFontSize: c.cover.subTitleTextRelFontSize,
        presenterTextRelFontSize: c.cover.presenterTextRelFontSize,
        dateTextRelFontSize: c.cover.dateTextRelFontSize,
      };
      return slide;
    }

    case "section": {
      const slide: SectionSlide = {
        type: "section",
        sectionTitle: c.section.sectionText ?? "",
        sectionSubtitle: c.section.smallerSectionText,
        sectionTextRelFontSize: c.section.sectionTextRelFontSize,
        smallerSectionTextRelFontSize: c.section.smallerSectionTextRelFontSize,
      };
      return slide;
    }

    case "freeform": {
      const rawLayout = await convertLayoutNode(c.freeform.content, projectId, addLog);
      const layout = normalizeLayout(rawLayout, 12);  // Fix spans that sum > 12
      const slide: ContentSlide = {
        type: "content",
        header: c.freeform.useHeader ? c.freeform.headerText : undefined,
        subHeader: c.freeform.useHeader ? c.freeform.subHeaderText : undefined,
        date: c.freeform.useHeader ? c.freeform.dateText : undefined,
        headerLogos: c.freeform.useHeader ? c.freeform.headerLogos : undefined,
        footer: c.freeform.useFooter ? c.freeform.footerText : undefined,
        footerLogos: c.freeform.useFooter ? c.freeform.footerLogos : undefined,
        layout,
      };
      return slide;
    }
  }
}

// =============================================================================
// LayoutNode<ReportItemContentItem> → LayoutNode<ContentBlock>
// =============================================================================

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  addLog: LogCallback
): Promise<LayoutNode<ContentBlock>> {
  if (node.type === "item") {
    const block = await convertContentItem(node.data, projectId, addLog);
    return {
      type: "item",
      id: node.id,
      data: block,
      span: node.span,  // PRESERVE span from source node
    };
  }

  // Recursively convert children
  const children = await Promise.all(
    (node.children ?? []).map((child) => convertLayoutNode(child, projectId, addLog))
  );
  return {
    type: node.type,
    id: node.id,
    children,
    span: node.span,  // PRESERVE span from source node
  };
}

// =============================================================================
// ReportItemContentItem → ContentBlock
// =============================================================================

async function convertContentItem(
  item: ReportItemContentItem,
  projectId: string,
  addLog: LogCallback
): Promise<ContentBlock> {
  switch (item.type) {
    // -------------------------------------------------------------------------
    // TEXT BLOCK
    // -------------------------------------------------------------------------
    case "text": {
      const block: TextBlock = {
        type: "text",
        markdown: item.markdown ?? "",
        style: {
          textSize: item.textSize,
          textBackground: item.textBackground !== "none" ? item.textBackground : undefined,
        },
      };
      return block;
    }

    // -------------------------------------------------------------------------
    // IMAGE BLOCK
    // -------------------------------------------------------------------------
    case "image": {
      const block: ImageBlock = {
        type: "image",
        imgFile: item.imgFile ?? "",
        style: {
          imgFit: item.imgFit === "inside" ? "contain" : "cover",
          // imgHeight, imgStretch are intentionally dropped
        },
      };
      return block;
    }

    // -------------------------------------------------------------------------
    // FIGURE BLOCK
    // -------------------------------------------------------------------------
    case "figure": {
      const poInfo = item.presentationObjectInReportInfo;
      if (!poInfo) {
        return { type: "text", markdown: "[Empty figure]" };
      }

      // Fetch PO detail to get config
      const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
      if (!poDetailRes.success) {
        addLog(`Figure PO not found: ${poInfo.id}`);
        return { type: "text", markdown: "[Missing figure]" };
      }

      // Build override for fetching figure inputs
      const override: ReplicantValueOverride = {
        selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
        additionalScale: item.useFigureAdditionalScale
          ? item.figureAdditionalScale ?? undefined
          : undefined,
        hideFigureCaption: item.hideFigureCaption,
        hideFigureSubCaption: item.hideFigureSubCaption,
        hideFigureFootnote: item.hideFigureFootnote,
      };

      // Clone config and apply overrides for storage
      // This preserves disaggregateBy (including replicateBy dimension)
      const configForSource: PresentationObjectConfig = structuredClone(poDetailRes.data.config);
      if (override.selectedReplicantValue) {
        configForSource.d.selectedReplicantValue = override.selectedReplicantValue;
      }
      if (override.hideFigureCaption) {
        configForSource.t.caption = "";
      }
      if (override.hideFigureSubCaption) {
        configForSource.t.subCaption = "";
      }
      if (override.hideFigureFootnote) {
        configForSource.t.footnote = "";
      }

      // Create source for refresh capability
      const source: FigureSource = {
        type: "from_data",
        metricId: poInfo.metricId,
        config: configForSource,
        snapshotAt: new Date().toISOString(),
      };

      // Fetch rendered figure data
      const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
        projectId,
        poInfo.id,
        override
      );

      // stripFigureInputsForStorage removes style and geoData before storage
      const block: FigureBlock = {
        type: "figure",
        figureInputs: figureInputsRes.success
          ? stripFigureInputsForStorage(figureInputsRes.data)
          : undefined,
        source,
      };

      if (!figureInputsRes.success) {
        addLog(`Figure render failed for PO ${poInfo.id}: ${figureInputsRes.err}`);
      }

      return block;
    }

    // -------------------------------------------------------------------------
    // FALLBACK (should not happen after legacy adapter)
    // -------------------------------------------------------------------------
    default: {
      addLog(`Unknown content type: ${(item as any).type}`);
      return { type: "text", markdown: "" };
    }
  }
}
```

### Step 3: Add Button to Instance Settings

**File:** `client/src/components/instance/instance_settings.tsx`

Update panther import (add `openComponent`):
```tsx
import {
  Button,
  Checkbox,
  FrameTop,
  HeadingBarMainRibbon,
  Input,
  openComponent,  // ADD THIS
  RadioGroup,
  SettingsSection,
  getSelectOptions,
  timActionButton,
} from "panther";
```

Add import for migration component:
```tsx
import { MigrateAllReportsToSlides } from "./migrate_all_reports_to_slides";
```

Add new SettingsSection before the closing `</div>` (line 446):

```tsx
<SettingsSection
  header={t3({ en: "Data Migration", fr: "Migration des données" })}
>
  <div class="ui-spy-sm">
    <div class="text-neutral text-sm">
      {t3({
        en: "One-time migration of old slide_deck reports to the new slides system.",
        fr: "Migration unique des anciens rapports de présentation vers le nouveau système de diapositives.",
      })}
    </div>
    <Button
      onClick={async () => {
        await openComponent({
          element: MigrateAllReportsToSlides,
          props: {},
        });
      }}
    >
      {t3({
        en: "Migrate all reports to slides",
        fr: "Migrer tous les rapports vers les diapositives",
      })}
    </Button>
  </div>
</SettingsSection>
```

### Step 4: Remove Project-Level Migration Button (After All Instances Migrated)

**File:** `client/src/components/project/project_settings.tsx`

Remove:
- Import of `MigrateReportsToSlides` (line 42)
- Button and surrounding code (lines 341-354)

**File:** `client/src/components/project/migrate_reports_to_slides.tsx`

Delete entire file after migration complete.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `client/src/components/instance/migrate_all_reports_to_slides.tsx` | Create (Step 1) |
| `client/src/components/instance/migrate_project_reports.ts` | Create (Step 2) |
| `client/src/components/instance/instance_settings.tsx` | Add button (Step 3) |
| `client/src/components/project/project_settings.tsx` | Remove button (Step 4, post-migration) |
| `client/src/components/project/migrate_reports_to_slides.tsx` | Delete (Step 4, post-migration) |

---

## Idempotency

Migration checks for existing "Old reports" / "Anciens rapports" folder in `projectDetail.slideDeckFolders`. If found, project is skipped.

**Partial failure case:** If folder was created but migration failed before completing all slides:
- The folder exists, so project would be skipped on re-run
- **Manual fix:** Delete the "Old reports" folder in that project, then re-run migration
- This is acceptable because partial failures should be rare and easily identifiable from the error log

---

## Execution Plan

**Time estimate:** ~2-5 minutes per instance depending on report count. Total: 1-2.5 hours for 30 instances.

Per instance:
1. Log in as admin (~30s)
2. Navigate to Settings tab (~10s)
3. Click "Migrate all reports to slides" (~5s)
4. Wait for completion (varies: 30s for few reports, 3-4 min for many)
5. Review log for errors, note any failures (~30s)

Full sequence:
1. Deploy with instance-level button
2. Run migration on all 30 instances, keeping a log of any errors
3. For any partial failures: delete "Old reports" folder in that project, re-run
4. Verify a sample of migrated decks render correctly
5. Deploy again with Step 4 changes (remove button + old component)

---

## Prerequisite

**PLAN_01_SLIDE_SCHEMAS.md must be completed first.**

The migration writes to `slides.config` which needs strict schemas for write-time validation.

---

## Error Handling

- Individual report failures logged but don't stop migration
- Individual project failures logged but don't stop other projects
- Error summary shown at end
- Can re-run safely due to idempotency check

---

## Validation Scripts

Analysis scripts created during planning:

- `export_reports` - Bash script to export all reports/report_items from production databases
- `analyze_reports.ts` - Deno script with Zod validation to verify migration logic against real data

These can be deleted after migration is complete.
