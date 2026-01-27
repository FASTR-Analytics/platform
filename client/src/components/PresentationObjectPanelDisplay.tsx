import {
  getModuleIdForMetric,
  PresentationObjectSummary,
  ProjectDetail,
  VisualizationFolder,
  t2,
  T,
} from "lib";
import { CollapsibleSection, openComponent, showMenu, type MenuItem } from "panther";
import { For, Show, Match, Switch, createSignal } from "solid-js";
import { setShowModules, showModules, vizGroupingMode } from "~/state/ui";
import { PresentationObjectMiniDisplay } from "./PresentationObjectMiniDisplay";
import { MoveToFolderModal } from "./project/move_to_folder_modal";

type Props = {
  projectDetail: ProjectDetail;
  searchText: string;
  onClick: (presentationObject: PresentationObjectSummary) => void;
};

export function PresentationObjectPanelDisplay(p: Props) {
  const isSearching = () => p.searchText.length >= 3;
  const mode = vizGroupingMode;

  const filteredVisualizations = () => {
    if (p.searchText.length < 3) return p.projectDetail.visualizations;
    const searchLower = p.searchText.toLowerCase();
    return p.projectDetail.visualizations.filter((po) =>
      po.label.toLowerCase().includes(searchLower)
    );
  };

  return (
    <div class="ui-spy ui-pad">
      <Switch>
        <Match when={mode() === "folders"}>
          <FoldersView
            projectDetail={p.projectDetail}
            visualizations={filteredVisualizations()}
            isSearching={isSearching()}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
        <Match when={mode() === "module"}>
          <ModuleView
            projectDetail={p.projectDetail}
            visualizations={filteredVisualizations()}
            isSearching={isSearching()}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
        <Match when={mode() === "metric"}>
          <MetricView
            projectDetail={p.projectDetail}
            visualizations={filteredVisualizations()}
            isSearching={isSearching()}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
        <Match when={mode() === "type"}>
          <TypeView
            projectDetail={p.projectDetail}
            visualizations={filteredVisualizations()}
            isSearching={isSearching()}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
        <Match when={mode() === "ai-status"}>
          <AIStatusView
            projectDetail={p.projectDetail}
            visualizations={filteredVisualizations()}
            isSearching={isSearching()}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
        <Match when={mode() === "flat"}>
          <FlatView
            projectId={p.projectDetail.id}
            visualizations={filteredVisualizations()}
            folders={p.projectDetail.visualizationFolders}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </Match>
      </Switch>
    </div>
  );
}

type GroupViewProps = {
  projectDetail: ProjectDetail;
  visualizations: PresentationObjectSummary[];
  isSearching: boolean;
  onClick: (po: PresentationObjectSummary) => void;
  searchText: string;
};

function FoldersView(p: GroupViewProps) {
  const [openSection, setOpenSection] = createSignal<string | undefined>(
    p.projectDetail.visualizationFolders[0]?.id
  );

  const folderGroups = () => {
    const groups: { folder: VisualizationFolder | null; vizs: PresentationObjectSummary[] }[] = [];

    for (const folder of p.projectDetail.visualizationFolders) {
      const vizs = p.visualizations.filter((v) => v.folderId === folder.id);
      if (vizs.length > 0 || !p.isSearching) {
        groups.push({ folder, vizs });
      }
    }

    const unfiled = p.visualizations.filter((v) => v.folderId === null);
    if (unfiled.length > 0) {
      groups.push({ folder: null, vizs: unfiled });
    }

    return groups;
  };

  return (
    <For each={folderGroups()}>
      {(group) => (
        <CollapsibleSection
          title={
            <div class="font-700 text-lg flex items-center gap-2">
              <Show when={group.folder?.color}>
                <div
                  class="w-3 h-3 rounded-full"
                  style={{ "background-color": group.folder!.color! }}
                />
              </Show>
              {group.folder?.label ?? "Unfiled"}
              <Show when={!p.isSearching && group.vizs.length}>
                <span class="font-400 text-sm">({group.vizs.length})</span>
              </Show>
            </div>
          }
          isOpen={openSection() === (group.folder?.id ?? "_unfiled") || p.isSearching}
          onToggle={(isOpen) =>
            setOpenSection(isOpen ? (group.folder?.id ?? "_unfiled") : undefined)
          }
        >
          <VisualizationGrid
            projectId={p.projectDetail.id}
            visualizations={group.vizs}
            folders={p.projectDetail.visualizationFolders}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </CollapsibleSection>
      )}
    </For>
  );
}

function ModuleView(p: GroupViewProps) {
  return (
    <For each={p.projectDetail.projectModules}>
      {(ms) => {
        const vizs = () =>
          p.visualizations.filter((po) => getModuleIdForMetric(po.metricId) === ms.id);

        return (
          <Show when={vizs().length > 0 || !p.isSearching}>
            <CollapsibleSection
              title={
                <div class="font-700 text-lg">
                  {ms.moduleDefinitionLabel}
                  <Show when={!p.isSearching && vizs().length}>
                    <span class="font-400 ml-2 text-sm">({vizs().length} visualizations)</span>
                  </Show>
                </div>
              }
              isOpen={showModules() === ms.id || p.isSearching}
              onToggle={(isOpen) => setShowModules(isOpen ? ms.id : undefined)}
            >
              <VisualizationGrid
                projectId={p.projectDetail.id}
                visualizations={vizs()}
                folders={p.projectDetail.visualizationFolders}
                onClick={p.onClick}
                searchText={p.searchText}
              />
            </CollapsibleSection>
          </Show>
        );
      }}
    </For>
  );
}

function MetricView(p: GroupViewProps) {
  const [openSection, setOpenSection] = createSignal<string | undefined>();

  const metricGroups = () => {
    const groups = new Map<string, PresentationObjectSummary[]>();
    for (const viz of p.visualizations) {
      const existing = groups.get(viz.metricId) ?? [];
      existing.push(viz);
      groups.set(viz.metricId, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  return (
    <For each={metricGroups()}>
      {([metricId, vizs]) => (
        <CollapsibleSection
          title={
            <div class="font-700 text-lg">
              {metricId}
              <Show when={!p.isSearching && vizs.length}>
                <span class="font-400 ml-2 text-sm">({vizs.length})</span>
              </Show>
            </div>
          }
          isOpen={openSection() === metricId || p.isSearching}
          onToggle={(isOpen) => setOpenSection(isOpen ? metricId : undefined)}
        >
          <VisualizationGrid
            projectId={p.projectDetail.id}
            visualizations={vizs}
            folders={p.projectDetail.visualizationFolders}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </CollapsibleSection>
      )}
    </For>
  );
}

function TypeView(p: GroupViewProps) {
  const [openSection, setOpenSection] = createSignal<string | undefined>("table");

  const typeGroups = () => {
    const tables = p.visualizations.filter((v) => !v.createdByAI);
    const timeseries: PresentationObjectSummary[] = [];
    const charts: PresentationObjectSummary[] = [];
    return [
      { type: "all", label: "All Visualizations", vizs: p.visualizations },
    ];
  };

  return (
    <For each={typeGroups()}>
      {(group) => (
        <CollapsibleSection
          title={
            <div class="font-700 text-lg">
              {group.label}
              <Show when={!p.isSearching && group.vizs.length}>
                <span class="font-400 ml-2 text-sm">({group.vizs.length})</span>
              </Show>
            </div>
          }
          isOpen={openSection() === group.type || p.isSearching}
          onToggle={(isOpen) => setOpenSection(isOpen ? group.type : undefined)}
        >
          <VisualizationGrid
            projectId={p.projectDetail.id}
            visualizations={group.vizs}
            folders={p.projectDetail.visualizationFolders}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </CollapsibleSection>
      )}
    </For>
  );
}

function AIStatusView(p: GroupViewProps) {
  const [openSection, setOpenSection] = createSignal<string | undefined>("default");

  const statusGroups = () => {
    const aiCreated = p.visualizations.filter((v) => v.createdByAI);
    const defaults = p.visualizations.filter((v) => !v.createdByAI && v.isDefault);
    const custom = p.visualizations.filter((v) => !v.createdByAI && !v.isDefault);

    const groups: { status: string; label: string; vizs: PresentationObjectSummary[] }[] = [];

    if (defaults.length > 0 || !p.isSearching) {
      groups.push({ status: "default", label: t2(T.FRENCH_UI_STRINGS.default), vizs: defaults });
    }
    if (custom.length > 0 || !p.isSearching) {
      groups.push({ status: "custom", label: t2(T.FRENCH_UI_STRINGS.custom), vizs: custom });
    }
    if (aiCreated.length > 0 || !p.isSearching) {
      groups.push({ status: "ai", label: "AI Created", vizs: aiCreated });
    }

    return groups;
  };

  return (
    <For each={statusGroups()}>
      {(group) => (
        <CollapsibleSection
          title={
            <div class="font-700 text-lg">
              {group.label}
              <Show when={!p.isSearching && group.vizs.length}>
                <span class="font-400 ml-2 text-sm">({group.vizs.length})</span>
              </Show>
            </div>
          }
          isOpen={openSection() === group.status || p.isSearching}
          onToggle={(isOpen) => setOpenSection(isOpen ? group.status : undefined)}
        >
          <VisualizationGrid
            projectId={p.projectDetail.id}
            visualizations={group.vizs}
            folders={p.projectDetail.visualizationFolders}
            onClick={p.onClick}
            searchText={p.searchText}
          />
        </CollapsibleSection>
      )}
    </For>
  );
}

type FlatViewProps = {
  projectId: string;
  visualizations: PresentationObjectSummary[];
  folders: VisualizationFolder[];
  onClick: (po: PresentationObjectSummary) => void;
  searchText: string;
};

function FlatView(p: FlatViewProps) {
  const sortedVizs = () =>
    [...p.visualizations].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <VisualizationGrid
      projectId={p.projectId}
      visualizations={sortedVizs()}
      folders={p.folders}
      onClick={p.onClick}
      searchText={p.searchText}
    />
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
