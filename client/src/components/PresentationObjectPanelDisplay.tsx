import {
  createMetricLookup,
  getMetricDisplayLabel,
  getModuleIdForMetric,
  groupMetricsByLabel,
  InstalledModuleSummary,
  MetricWithStatus,
  PresentationObjectSummary,
  ProjectDetail,
  VisualizationFolder,
  VisualizationGroupingMode,
  t2,
  T,
} from "lib";
import { Button, Checkbox, FrameLeftResizable, getColor, openComponent, Select, SelectList, showMenu, timActionDelete, type MenuItem, type SelectOption } from "panther";
import { createEffect, For, Show } from "solid-js";
import { vizGroupingMode, setVizGroupingMode, vizSelectedGroup, setVizSelectedGroup, hideUnreadyVisualizations, setHideUnreadyVisualizations } from "~/state/ui";
import { serverActions } from "~/server_actions";
import { PresentationObjectMiniDisplay } from "./PresentationObjectMiniDisplay";
import { EditFolderModal } from "./project/edit_folder_modal";
import { MoveToFolderModal } from "./project/move_to_folder_modal";
import { DuplicateVisualization } from "./visualization/duplicate_visualization";
import { CreateSlideFromVisualizationModal } from "./visualization/create_slide_from_visualization_modal";

const GROUPING_OPTIONS: { value: VisualizationGroupingMode; label: string }[] = [
  { value: "folders", label: "By folder" },
  { value: "module", label: "By module" },
  { value: "metric", label: "By metric" },
  // { value: "ownership", label: "By ownership" },
  { value: "flat", label: "Flat list" },
];

type GroupOption = {
  value: string;
  label: string;
  count: number;
  color?: string | null;
};

type SubGroupConfig = {
  getGroupKey: (po: PresentationObjectSummary) => string;
  getGroupLabel: (key: string, modules: InstalledModuleSummary[]) => string;
  getGroupOrder: (modules: InstalledModuleSummary[]) => string[];
};

type Props = {
  projectDetail: ProjectDetail;
  searchText: string;
  onClick: (presentationObject: PresentationObjectSummary) => void;
};

export function PresentationObjectPanelDisplay(p: Props) {

  const readyMetricIds = () => new Set(
    p.projectDetail.metrics.filter(m => m.status === "ready").map(m => m.id)
  );

  const filteredBySearch = () => {
    let vizs = p.projectDetail.visualizations;

    if (hideUnreadyVisualizations()) {
      const ready = readyMetricIds();
      vizs = vizs.filter(po => ready.has(po.metricId));
    }

    if (p.searchText.length < 3) return vizs;
    const searchLower = p.searchText.toLowerCase();
    return vizs.filter((po) =>
      po.label.toLowerCase().includes(searchLower)
    );
  };

  const groupOptions = (): GroupOption[] => {
    const vizs = filteredBySearch();
    const mode = vizGroupingMode();

    switch (mode) {
      case "folders": {
        const defaults = vizs.filter((v) => v.isDefault && !v.createdByAI);
        const generalCount = vizs.filter((v) => v.folderId === null && !v.isDefault && !v.createdByAI).length;
        const groups: GroupOption[] = [
          { value: "_defaults", label: "Defaults", count: defaults.length },
          { value: "_unfiled", label: "General", count: generalCount },
        ];
        groups.push(...p.projectDetail.visualizationFolders.map((f) => ({
          value: f.id,
          label: f.label,
          count: vizs.filter((v) => v.folderId === f.id && !v.isDefault).length,
          color: f.color,
        })));
        return groups;
      }

      case "module":
        return p.projectDetail.projectModules.map((m) => ({
          value: m.id,
          label: m.moduleDefinitionLabel,
          count: vizs.filter((v) => getModuleIdForMetric(v.metricId) === m.id).length,
        }));

      case "metric": {
        const metricGroups = groupMetricsByLabel(p.projectDetail.metrics);
        const moduleOrder = new Map(
          p.projectDetail.projectModules.map((m, i) => [m.id, i])
        );
        return metricGroups
          .filter((group) => {
            // Only include groups that have visualizations
            return group.variants.some((m) => vizs.some((v) => v.metricId === m.id));
          })
          .sort((a, b) => {
            const moduleA = a.variants[0].moduleId;
            const moduleB = b.variants[0].moduleId;
            const moduleOrderA = moduleOrder.get(moduleA) ?? 999;
            const moduleOrderB = moduleOrder.get(moduleB) ?? 999;
            if (moduleOrderA !== moduleOrderB) {
              return moduleOrderA - moduleOrderB;
            }
            return a.variants[0].id.localeCompare(b.variants[0].id);
          })
          .map((group) => {
            const count = group.variants.reduce(
              (sum, m) => sum + vizs.filter((v) => v.metricId === m.id).length,
              0
            );
            return {
              value: group.label,
              label: group.label,
              count,
            };
          });
      }


      case "flat":
        return [{ value: "_all", label: "All Visualizations", count: vizs.length }];

      default:
        return [];
    }
  };

  const filteredVisualizations = () => {
    const vizs = filteredBySearch();
    const group = vizSelectedGroup();
    const mode = vizGroupingMode();

    if (!group) return [];

    switch (mode) {
      case "folders":
        if (group === "_defaults") {
          return vizs.filter((v) => v.isDefault && !v.createdByAI);
        }
        if (group === "_unfiled") {
          return vizs.filter((v) => v.folderId === null && !v.isDefault && !v.createdByAI);
        }
        return vizs.filter((v) => v.folderId === group && !v.isDefault);

      case "module":
        return vizs.filter((v) => getModuleIdForMetric(v.metricId) === group);

      case "metric": {
        // group is the metric label, find all metric IDs with that label
        const metricGroups = groupMetricsByLabel(p.projectDetail.metrics);
        const metricGroup = metricGroups.find((g) => g.label === group);
        if (!metricGroup) return [];
        const metricIds = new Set(metricGroup.variants.map((m) => m.id));
        return vizs.filter((v) => metricIds.has(v.metricId));
      }


      case "flat":
        return [...vizs].sort((a, b) => a.label.localeCompare(b.label));

      default:
        return vizs;
    }
  };

  const subGroupConfig = (): SubGroupConfig | null => {
    const group = vizSelectedGroup();
    const mode = vizGroupingMode();

    // Sub-group by module for Defaults folder or "default" in ownership
    if ((mode === "folders" && group === "_defaults")) {
      return {
        getGroupKey: (po) => getModuleIdForMetric(po.metricId),
        getGroupLabel: (key, modules) => modules.find((m) => m.id === key)?.moduleDefinitionLabel ?? key,
        getGroupOrder: (modules) => modules.map((m) => m.id),
      };
    }

    // Sub-group by metric for module view
    if (mode === "module") {
      const lookup = createMetricLookup(p.projectDetail.metrics);
      return {
        getGroupKey: (po) => po.metricId,
        getGroupLabel: (key) => {
          const metric = lookup.get(key);
          return metric ? getMetricDisplayLabel(metric) : key;
        },
        getGroupOrder: () => [], // Empty = use natural order from visualizations
      };
    }

    // Sub-group by variant for metric view (only if metric has multiple variants)
    if (mode === "metric" && group) {
      const metricGroups = groupMetricsByLabel(p.projectDetail.metrics);
      const metricGroup = metricGroups.find((g) => g.label === group);
      if (metricGroup && metricGroup.variants.length > 1) {
        const lookup = createMetricLookup(p.projectDetail.metrics);
        return {
          getGroupKey: (po) => po.metricId,
          getGroupLabel: (key) => {
            const metric = lookup.get(key);
            return metric?.variantLabel || "Default";
          },
          getGroupOrder: () => metricGroup.variants.map((m) => m.id),
        };
      }
    }

    return null;
  };

  createEffect(() => {
    vizGroupingMode();
    const groups = groupOptions();
    const current = vizSelectedGroup();
    if (groups.length > 0 && !groups.find((g) => g.value === current)) {
      setVizSelectedGroup(groups[0].value);
    }
  });

  function handleFolderContextMenu(e: MouseEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const folder = p.projectDetail.visualizationFolders.find((f) => f.id === folderId);
    if (!folder) return;

    const items: MenuItem[] = [
      {
        label: "Rename / Change color...",
        icon: "pencil",
        onClick: async () => {
          await openComponent({
            element: EditFolderModal,
            props: {
              projectId: p.projectDetail.id,
              folder,
            },
          });
        },
      },
      {
        label: "Delete folder",
        icon: "trash",
        intent: "danger",
        onClick: async () => {
          const deleteAction = timActionDelete(
            "Are you sure you want to delete this folder? Visualizations will be moved to General.",
            () => serverActions.deleteVisualizationFolder({
              projectId: p.projectDetail.id,
              folder_id: folderId,
            }),
            () => { },
          );
          await deleteAction.click();
        },
      },
    ];
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  const renderGroupOption = (selectOpt: SelectOption<string>) => {
    const opt = groupOptions().find((g) => g.value === selectOpt.value);
    if (!opt) return <span>{selectOpt.label}</span>;

    const mode = vizGroupingMode();
    if (mode === "folders") {
      const isUserFolder = !selectOpt.value.startsWith("_");
      return (
        <div
          class="flex items-center gap-2"
          onContextMenu={isUserFolder ? (e) => handleFolderContextMenu(e, selectOpt.value) : undefined}
        >
          <div
            class="h-2.5 w-2.5 flex-none rounded-full"
            style={{ "background-color": opt.color ?? getColor({ key: "base300" }) }}
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
    <FrameLeftResizable
      startingWidth={250}
      minWidth={180}
      panelChildren={
        <div class="border-base-300 flex h-full w-full flex-col border-r">
          <div class="border-base-300 border-b p-3 flex flex-col gap-2">
            <Select
              options={GROUPING_OPTIONS}
              value={vizGroupingMode()}
              onChange={(v) => setVizGroupingMode(v as VisualizationGroupingMode)}
              fullWidth
            />
            <Checkbox
              label="Hide unavailable"
              checked={hideUnreadyVisualizations()}
              onChange={setHideUnreadyVisualizations}
            />
          </div>
          <div class="flex-1 overflow-auto p-2">
            <SelectList
              options={groupOptions()}
              value={vizSelectedGroup() ?? undefined}
              onChange={setVizSelectedGroup}
              renderOption={renderGroupOption}
              fullWidth
            />
            <Show when={vizGroupingMode() === "folders"}>
              <div class="py-3">
                <Button
                  size="sm"
                  outline
                  iconName="plus"
                  onClick={async () => {
                    await openComponent({
                      element: EditFolderModal,
                      props: { projectId: p.projectDetail.id },
                    });
                  }}
                >
                  New folder
                </Button>
              </div>
            </Show>
          </div>
        </div>
      }
    >
      <VisualizationGrid
        projectId={p.projectDetail.id}
        visualizations={filteredVisualizations()}
        folders={p.projectDetail.visualizationFolders}
        modules={p.projectDetail.projectModules}
        metrics={p.projectDetail.metrics}
        subGroupConfig={subGroupConfig()}
        onClick={p.onClick}
        searchText={p.searchText}
      />
    </FrameLeftResizable>
  );
}

type VisualizationGridProps = {
  projectId: string;
  visualizations: PresentationObjectSummary[];
  folders: VisualizationFolder[];
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  subGroupConfig: SubGroupConfig | null;
  onClick: (po: PresentationObjectSummary) => void;
  searchText: string;
};

function VisualizationGrid(p: VisualizationGridProps) {
  const metricLookup = () => createMetricLookup(p.metrics);

  async function handleDuplicate(po: PresentationObjectSummary) {
    await openComponent({
      element: DuplicateVisualization,
      props: {
        projectId: p.projectId,
        poDetail: { id: po.id, label: po.label, folderId: po.folderId },
        folders: p.folders,
      },
    });
  }

  async function handleDelete(po: PresentationObjectSummary) {
    const deleteAction = timActionDelete(
      t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet_1),
      () =>
        serverActions.deletePresentationObject({
          projectId: p.projectId,
          po_id: po.id,
        }),
      () => {
        // SSE will handle refresh
      },
    );
    await deleteAction.click();
  }

  const renderCard = (po: PresentationObjectSummary) => (
    <VisualizationCard
      projectId={p.projectId}
      po={po}
      folders={p.folders}
      metrics={p.metrics}
      metricLookup={metricLookup()}
      onClick={() => p.onClick(po)}
      onDuplicate={() => handleDuplicate(po)}
      onDelete={() => handleDelete(po)}
    />
  );

  const emptyMessage = () => (
    <div class="text-neutral text-sm">
      {p.searchText.length >= 3
        ? t2(T.FRENCH_UI_STRINGS.no_matching_visualizations)
        : t2(T.FRENCH_UI_STRINGS.no_visualizations)}
    </div>
  );

  return (
    <Show
      when={p.subGroupConfig}
      fallback={
        <div class="ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto">
          <For each={p.visualizations} fallback={emptyMessage()}>
            {renderCard}
          </For>
        </div>
      }
    >
      {(config) => {
        const grouped = () => {
          const { getGroupKey, getGroupLabel, getGroupOrder } = config();
          const order = getGroupOrder(p.modules);
          const groups = new Map<string, PresentationObjectSummary[]>();

          for (const po of p.visualizations) {
            const key = getGroupKey(po);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(po);
          }

          // Use provided order, or natural order from visualizations if order is empty
          const keys = order.length > 0 ? order.filter((key) => groups.has(key)) : Array.from(groups.keys());

          return keys.map((key) => ({
            key,
            label: getGroupLabel(key, p.modules),
            items: groups.get(key)!,
          }));
        };

        return (
          <div class="h-full w-full overflow-auto">
            <Show when={grouped().length > 0} fallback={emptyMessage()}>
              <For each={grouped()}>
                {(group, i) => (
                  <div class="mb-6" classList={{ "pt-4": i() === 0, "pt-2": i() > 0 }}>
                    <div class="border-base-300 mb-3 flex items-center gap-3 border-b mx-4 pb-2">
                      <span class="text-base-content text-sm font-700">{group.label}</span>
                      <span class="text-neutral text-xs">({group.items.length})</span>
                    </div>
                    <div class="px-4 pt-1 pb-4 ui-gap grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start">
                      <For each={group.items}>{renderCard}</For>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}

type VisualizationCardProps = {
  projectId: string;
  po: PresentationObjectSummary;
  folders: VisualizationFolder[];
  metrics: MetricWithStatus[];
  metricLookup: Map<string, MetricWithStatus>;
  onClick: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function VisualizationCard(p: VisualizationCardProps) {
  async function handleCreateSlide() {
    await openComponent({
      element: CreateSlideFromVisualizationModal,
      props: {
        projectId: p.projectId,
        visualizationId: p.po.id,
        visualizationLabel: p.po.label,
        replicateBy: p.po.replicateBy,
        metrics: p.metrics,
      },
    });
  }

  async function handleContextMenu(e: MouseEvent) {
    e.preventDefault();

    const items: MenuItem[] = [];
    if (!p.po.isDefault) {
      items.push({
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
      });
    }
    items.push(
      {
        label: "Create slide...",
        icon: "plus",
        onClick: handleCreateSlide,
      },
      {
        label: "Duplicate...",
        icon: "copy",
        onClick: p.onDuplicate,
      },
      {
        label: "Delete",
        icon: "trash",
        intent: "danger",
        onClick: p.onDelete,
      },
    );
    showMenu({ x: e.clientX, y: e.clientY, items });
  }

  const isReady = () => p.metricLookup.get(p.po.metricId)?.status === "ready";

  return (
    <div
      class="bg-base-100 cursor-pointer ring-offset-[6px] grid grid-rows-subgrid row-span-3 gap-y-1"
      onClick={p.onClick}
      onContextMenu={handleContextMenu}
    >
      <div class="ui-gap-sm flex items-end pb-1">
        <div class="font-400 text-base-content text-xs italic">{p.po.label}</div>
      </div>
      <Show
        when={isReady()}
        fallback={
          <div class="border-base-300 border p-2 rounded bg-base-200 aspect-video flex items-center justify-center">
            <span class="text-neutral text-xs">Not available</span>
          </div>
        }
      >
        <div class="border-base-300 border hover:border-primary p-2 rounded">
          <PresentationObjectMiniDisplay
            projectId={p.projectId}
            presentationObjectId={p.po.id}
            moduleId={getModuleIdForMetric(p.po.metricId)}
            shapeType={"force-aspect-video"}
            scalePixelResolution={0.2}
          />
        </div>
      </Show>
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
            User
          </div>
        </Show>
      </div>
    </div>
  );
}
