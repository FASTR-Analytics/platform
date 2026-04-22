# Plan: Instance-Level Report to Slides Migration

Migrate old `slide_deck` type reports to the new slides system via an instance-level client-side button. One click per instance, 30 total clicks, then remove the button.

## Current State

**Existing migration component:** `client/src/components/project/migrate_reports_to_slides.tsx`

Current flow:
1. Takes `ProjectDetail` as prop (includes `reports: ReportSummary[]`)
2. Filters for `reportType === "slide_deck"`
3. Creates "Old reports" folder via `serverActions.createSlideDeckFolder()`
4. For each report:
   - Calls `serverActions.backupReport()` to get full report data
   - Creates slide deck with converted config
   - Creates slides for each report item
   - For figures: calls `getPOFigureInputsFromCacheOrFetch()` then `stripFigureInputsForStorage()`

**Button location:** `client/src/components/project/project_settings.tsx` lines 341-353

## Goal

Move migration button to instance level so one click migrates all projects in the instance.

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

Full implementation (not just references):

```tsx
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

// --- Helper functions ---

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
      const layout = await convertLayoutNode(c.freeform.content, projectId, addLog);
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
      span: node.span,
    };
  }

  const children = await Promise.all(
    (node.children ?? []).map((child) => convertLayoutNode(child, projectId, addLog))
  );
  return {
    type: node.type,
    id: node.id,
    children,
    span: node.span,
  };
}

async function convertContentItem(
  item: ReportItemContentItem,
  projectId: string,
  addLog: LogCallback
): Promise<ContentBlock> {
  switch (item.type) {
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

    case "figure": {
      const poInfo = item.presentationObjectInReportInfo;
      if (!poInfo) {
        return { type: "text", markdown: "[Empty figure]" };
      }

      const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
      if (!poDetailRes.success) {
        addLog(`Figure PO not found: ${poInfo.id}`);
        return { type: "text", markdown: "[Missing figure]" };
      }

      const override: ReplicantValueOverride = {
        selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
        additionalScale: item.useFigureAdditionalScale
          ? item.figureAdditionalScale ?? undefined
          : undefined,
        hideFigureCaption: item.hideFigureCaption,
        hideFigureSubCaption: item.hideFigureSubCaption,
        hideFigureFootnote: item.hideFigureFootnote,
      };

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

      const source: FigureSource = {
        type: "from_data",
        metricId: poInfo.metricId,
        config: configForSource,
        snapshotAt: new Date().toISOString(),
      };

      const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
        projectId,
        poInfo.id,
        override
      );

      // NOTE: stripFigureInputsForStorage removes style and geoData before storage.
      // The existing project-level migration omits this - this is a bug fix.
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
  }
}
```

### Step 3: Add Button to Instance Settings

**File:** `client/src/components/instance/instance_settings.tsx`

Add import:
```tsx
import { MigrateAllReportsToSlides } from "./migrate_all_reports_to_slides";
```

Add new SettingsSection before the closing `</div>` (around line 445):

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

Add import for `openComponent` if not present.

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

**Alternative considered:** Check folder exists AND has slide decks in it. Rejected because it requires additional API call per project and the simple check is sufficient for a one-time migration.

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
