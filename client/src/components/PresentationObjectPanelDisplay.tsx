import {
  getModuleIdForMetric,
  PresentationObjectSummary,
  ProjectDetail,
  VisualizationFolder,
  VisualizationGroupingMode,
  t2,
  T,
} from "lib";
import { FrameLeft, openComponent, Select, SelectList, showMenu, type MenuItem, type SelectOption } from "panther";
import { createEffect, createSignal, For, Show } from "solid-js";
import { vizGroupingMode, setVizGroupingMode } from "~/state/ui";
import { PresentationObjectMiniDisplay } from "./PresentationObjectMiniDisplay";
import { MoveToFolderModal } from "./project/move_to_folder_modal";

const GROUPING_OPTIONS: { value: VisualizationGroupingMode; label: string }[] = [
  { value: "module", label: "By module" },
  { value: "folders", label: "By folder" },
  { value: "metric", label: "By metric" },
  { value: "ai-status", label: "By status" },
  { value: "flat", label: "Flat list" },
];

type GroupOption = {
  value: string;
  label: string;
  count: number;
  color?: string | null;
};

type Props = {
  projectDetail: ProjectDetail;
  searchText: string;
  onClick: (presentationObject: PresentationObjectSummary) => void;
};

export function PresentationObjectPanelDisplay(p: Props) {
  const [selectedGroup, setSelectedGroup] = createSignal<string | null>(null);

  const filteredBySearch = () => {
    if (p.searchText.length < 3) return p.projectDetail.visualizations;
    const searchLower = p.searchText.toLowerCase();
    return p.projectDetail.visualizations.filter((po) =>
      po.label.toLowerCase().includes(searchLower)
    );
  };

  const groupOptions = (): GroupOption[] => {
    const vizs = filteredBySearch();
    const mode = vizGroupingMode();

    switch (mode) {
      case "folders": {
        const groups: GroupOption[] = p.projectDetail.visualizationFolders.map((f) => ({
          value: f.id,
          label: f.label,
          count: vizs.filter((v) => v.folderId === f.id).length,
          color: f.color,
        }));
        const unfiledCount = vizs.filter((v) => v.folderId === null).length;
        if (unfiledCount > 0 || p.projectDetail.visualizationFolders.length === 0) {
          groups.push({ value: "_unfiled", label: "Unfiled", count: unfiledCount });
        }
        return groups;
      }

      case "module":
        return p.projectDetail.projectModules.map((m) => ({
          value: m.id,
          label: m.moduleDefinitionLabel,
          count: vizs.filter((v) => getModuleIdForMetric(v.metricId) === m.id).length,
        }));

      case "metric": {
        const metricMap = new Map<string, number>();
        for (const viz of vizs) {
          metricMap.set(viz.metricId, (metricMap.get(viz.metricId) ?? 0) + 1);
        }
        return Array.from(metricMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([metricId, count]) => ({
            value: metricId,
            label: metricId,
            count,
          }));
      }

      case "ai-status": {
        const defaults = vizs.filter((v) => !v.createdByAI && v.isDefault);
        const custom = vizs.filter((v) => !v.createdByAI && !v.isDefault);
        const ai = vizs.filter((v) => v.createdByAI);
        return [
          { value: "default", label: t2(T.FRENCH_UI_STRINGS.default), count: defaults.length },
          { value: "custom", label: t2(T.FRENCH_UI_STRINGS.custom), count: custom.length },
          { value: "ai", label: "AI Created", count: ai.length },
        ];
      }

      case "flat":
        return [{ value: "_all", label: "All Visualizations", count: vizs.length }];

      default:
        return [];
    }
  };

  const filteredVisualizations = () => {
    const vizs = filteredBySearch();
    const group = selectedGroup();
    const mode = vizGroupingMode();

    if (!group) return [];

    switch (mode) {
      case "folders":
        return group === "_unfiled"
          ? vizs.filter((v) => v.folderId === null)
          : vizs.filter((v) => v.folderId === group);

      case "module":
        return vizs.filter((v) => getModuleIdForMetric(v.metricId) === group);

      case "metric":
        return vizs.filter((v) => v.metricId === group);

      case "ai-status":
        if (group === "default") return vizs.filter((v) => !v.createdByAI && v.isDefault);
        if (group === "custom") return vizs.filter((v) => !v.createdByAI && !v.isDefault);
        if (group === "ai") return vizs.filter((v) => v.createdByAI);
        return vizs;

      case "flat":
        return [...vizs].sort((a, b) => a.label.localeCompare(b.label));

      default:
        return vizs;
    }
  };

  createEffect(() => {
    vizGroupingMode();
    const groups = groupOptions();
    const current = selectedGroup();
    if (groups.length > 0 && !groups.find((g) => g.value === current)) {
      setSelectedGroup(groups[0].value);
    }
  });

  const renderGroupOption = (selectOpt: SelectOption<string>) => {
    const opt = groupOptions().find((g) => g.value === selectOpt.value);
    if (!opt) return <span>{selectOpt.label}</span>;

    const mode = vizGroupingMode();
    if (mode === "folders" && opt.color) {
      return (
        <div class="flex items-center gap-2">
          <div
            class="h-2 w-2 flex-none rounded-full"
            style={{ "background-color": opt.color }}
          />
          <span class="flex-1 truncate">{opt.label}</span>
          <span class="text-neutral text-xs">({opt.count})</span>
        </div>
      );
    }
    return (
      <div class="flex items-center justify-between gap-2">
        <span class="truncate">{opt.label}</span>
        <span class="text-neutral text-xs">({opt.count})</span>
      </div>
    );
  };

  return (
    <FrameLeft
      panelChildren={
        <div class="border-base-300 flex h-full w-56 flex-col border-r">
          <div class="border-base-300 border-b p-3">
            <Select
              options={GROUPING_OPTIONS}
              value={vizGroupingMode()}
              onChange={(v) => setVizGroupingMode(v as VisualizationGroupingMode)}
              size="sm"
              fullWidth
            />
          </div>
          <div class="flex-1 overflow-auto p-2">
            <SelectList
              options={groupOptions()}
              value={selectedGroup() ?? undefined}
              onChange={setSelectedGroup}
              renderOption={renderGroupOption}
              fullWidth
            />
          </div>
        </div>
      }
    >
      <VisualizationGrid
        projectId={p.projectDetail.id}
        visualizations={filteredVisualizations()}
        folders={p.projectDetail.visualizationFolders}
        onClick={p.onClick}
        searchText={p.searchText}
      />
    </FrameLeft>
  );
}

type VisualizationGridProps = {
  projectId: string;
  visualizations: PresentationObjectSummary[];
  folders: VisualizationFolder[];
  onClick: (po: PresentationObjectSummary) => void;
  searchText: string;
};

function VisualizationGrid(p: VisualizationGridProps) {
  return (
    <div class="ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto">
      <For
        each={p.visualizations}
        fallback={
          <div class="text-neutral text-sm">
            {p.searchText.length >= 3
              ? t2(T.FRENCH_UI_STRINGS.no_matching_visualizations)
              : t2(T.FRENCH_UI_STRINGS.no_visualizations)}
          </div>
        }
      >
        {(po) => (
          <VisualizationCard
            projectId={p.projectId}
            po={po}
            folders={p.folders}
            onClick={() => p.onClick(po)}
          />
        )}
      </For>
    </div>
  );
}

type VisualizationCardProps = {
  projectId: string;
  po: PresentationObjectSummary;
  folders: VisualizationFolder[];
  onClick: () => void;
};

function VisualizationCard(p: VisualizationCardProps) {
  async function handleContextMenu(e: MouseEvent) {
    e.preventDefault();

    const items: MenuItem[] = [
      {
        label: "Move to folder...",
        icon: "folder",
        onClick: async () => {
          await openComponent({
            element: MoveToFolderModal,
            props: {
              projectId: p.projectId,
              presentationObjectId: p.po.id,
              currentFolderId: p.po.folderId,
              folders: p.folders,
            },
          });
        },
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  return (
    <div
      class="bg-base-100 hover:ring-primary cursor-pointer ring-offset-[6px] hover:ring-4"
      onClick={p.onClick}
      onContextMenu={handleContextMenu}
    >
      <div class="ui-gap-sm flex items-start justify-between pb-1">
        <div class="font-400 text-base-content text-xs italic">{p.po.label}</div>
      </div>
      <div class="border-base-300 border p-1.5">
        <PresentationObjectMiniDisplay
          projectId={p.projectId}
          presentationObjectId={p.po.id}
          moduleId={getModuleIdForMetric(p.po.metricId)}
          shapeType={"force-aspect-video"}
          scalePixelResolution={0.2}
        />
      </div>
      <div class="ui-gap-sm flex items-start justify-end pt-1">
        <Show when={p.po.replicateBy && !p.po.isFiltered}>
          <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
            {t2(T.FRENCH_UI_STRINGS.replicated)}:{" "}
            {p.po.replicateBy === "admin_area_2"
              ? "AA2"
              : p.po.replicateBy === "admin_area_3"
                ? "AA3"
                : "Indicator"}
          </div>
        </Show>
        <Show when={!p.po.replicateBy && p.po.isFiltered}>
          <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
            {t2(T.FRENCH_UI_STRINGS.filtered)}
          </div>
        </Show>
        <Show when={p.po.replicateBy && p.po.isFiltered}>
          <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
            {t2(T.FRENCH_UI_STRINGS.repl__filt)}
          </div>
        </Show>
        <Show when={p.po.createdByAI}>
          <div class="bg-danger font-400 text-base-100 rounded px-1 py-0.5 text-xs">AI</div>
        </Show>
        <Show when={!p.po.createdByAI && p.po.isDefault}>
          <div class="bg-success font-400 text-base-100 rounded px-1 py-0.5 text-xs">
            {t2(T.FRENCH_UI_STRINGS.default)}
          </div>
        </Show>
        <Show when={!p.po.createdByAI && !p.po.isDefault}>
          <div class="font-400 text-base-100 rounded bg-[orange] px-1 py-0.5 text-xs">
            {t2(T.FRENCH_UI_STRINGS.custom)}
          </div>
        </Show>
      </div>
    </div>
  );
}
