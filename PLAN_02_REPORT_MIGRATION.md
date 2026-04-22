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

Extract the core migration logic from `migrate_reports_to_slides.tsx` into a reusable function:

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

// --- Helper functions (copied from migrate_reports_to_slides.tsx) ---

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
  // ... (copy implementation from migrate_reports_to_slides.tsx lines 241-294)
}

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  addLog: LogCallback
): Promise<LayoutNode<ContentBlock>> {
  // ... (copy implementation from migrate_reports_to_slides.tsx lines 297-321)
}

async function convertContentItem(
  item: ReportItemContentItem,
  projectId: string,
  addLog: LogCallback
): Promise<ContentBlock> {
  // ... (copy implementation from migrate_reports_to_slides.tsx lines 323-411)
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

Migration checks for existing "Old reports" / "Anciens rapports" folder in `projectDetail.slideDeckFolders`. If found, project is skipped. This allows:
- Safe re-run if browser crashes mid-migration
- Safe re-run across multiple sessions
- No duplicate folders or slide decks

---

## Execution Plan

1. Deploy with instance-level button
2. Log into each of 30 instances as admin
3. Go to Settings tab
4. Click "Migrate all reports to slides"
5. Wait for completion, note any errors
6. After all 30 instances done, deploy again with Step 4 changes (remove button + old component)

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
