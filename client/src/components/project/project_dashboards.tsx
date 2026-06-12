import { DashboardSummary, t3, TC } from "lib";
import {
  Button,
  createSelectionController,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
  SelectionCircle,
  showMenu,
  createDeleteAction,
  type MenuItem,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import { serverActions } from "~/server_actions";
import { CreateDashboardModal } from "../dashboards/create_dashboard_modal";
import { DashboardEditor } from "../dashboards/dashboard_editor";

type Props = {
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectDashboards(p: Props) {
  const [searchText, setSearchText] = createSignal("");

  const filtered = (): DashboardSummary[] => {
    const dashboards = projectState.dashboards;
    if (searchText().length < 3) return dashboards;
    const q = searchText().toLowerCase();
    return dashboards.filter(
      (d) =>
        d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q),
    );
  };

  const selection = createSelectionController<string>({
    ids: () => filtered().map((d) => d.id),
    mode: "multi",
  });

  async function openDashboard(dashboardId: string, title: string) {
    await p.openProjectEditor({
      element: DashboardEditor,
      props: {
        projectId: projectState.id,
        dashboardId,
        title,
      },
    });
  }

  async function attemptCreate() {
    const res = await openComponent({
      element: CreateDashboardModal,
      props: { projectId: projectState.id },
    });
    if (res === undefined) return;
    const d = projectState.dashboards.find((x) => x.id === res.newDashboardId);
    await openDashboard(res.newDashboardId, d?.title || "Dashboard");
  }

  async function handleDelete(dashboard: DashboardSummary) {
    const idsToDelete = selection.getBatchIds(dashboard.id);

    const confirmText =
      idsToDelete.length > 1
        ? t3({
            en: `Are you sure you want to delete ${idsToDelete.length} dashboards?`,
            fr: `Êtes-vous sûr de vouloir supprimer ${idsToDelete.length} tableaux de bord ?`,
          })
        : t3({
            en: `Are you sure you want to delete "${dashboard.title}"?`,
            fr: `Êtes-vous sûr de vouloir supprimer « ${dashboard.title} » ?`,
          });

    const deleteAction = createDeleteAction(
      confirmText,
      async () => {
        const promises = idsToDelete.map((id) =>
          serverActions.deleteDashboard({
            projectId: projectState.id,
            dashboard_id: id,
          }),
        );
        const results = await Promise.all(promises);
        const failed = results.filter((r) => !r.success);
        if (failed.length > 0) {
          return failed[0];
        }
        return results[0];
      },
      () => {
        selection.clear();
      },
    );
    await deleteAction.click();
  }

  function handleContextMenu(e: MouseEvent, dashboard: DashboardSummary) {
    e.preventDefault();

    const isMultiSelect =
      selection.isSelected(dashboard.id) && selection.selectedCount() > 1;
    const count = selection.selectedCount();

    const items: MenuItem[] = [
      {
        label: isMultiSelect
          ? t3({
              en: `Delete ${count} dashboards`,
              fr: `Supprimer ${count} tableaux de bord`,
            })
          : t3(TC.delete),
        icon: "trash",
        intent: "danger",
        onClick: () => handleDelete(dashboard),
      },
    ];
    showMenu({
      anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 },
      items,
    });
  }

  const canConfigure = () =>
    projectState.thisUserPermissions.can_configure_slide_decks &&
    !projectState.isLocked;

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Dashboards", fr: "Tableaux de bord" })}
          searchText={searchText()}
          setSearchText={setSearchText}
          class="border-base-300"
        >
          <Show when={canConfigure()}>
            <Button onClick={attemptCreate} iconName="plus">
              {t3({ en: "Create dashboard", fr: "Créer un tableau de bord" })}
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <div
        class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] content-start items-start overflow-auto"
        onClick={() => selection.clear()}
      >
        <For
          each={filtered()}
          fallback={
            <div class="text-neutral text-sm">
              {searchText().length >= 3
                ? t3({
                    en: "No matching dashboards",
                    fr: "Aucun tableau de bord correspondant",
                  })
                : t3({
                    en: "No dashboards yet",
                    fr: "Aucun tableau de bord pour le moment",
                  })}
            </div>
          }
        >
          {(dashboard) => {
            const isSelected = () => selection.isSelected(dashboard.id);
            return (
              <div
                class="group relative cursor-pointer rounded-md border p-3"
                classList={{
                  "border-base-300 hover:border-primary": !isSelected(),
                  "border-primary": isSelected(),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selection.handleClick(dashboard.id, e, () =>
                    openDashboard(dashboard.id, dashboard.title),
                  );
                }}
                onContextMenu={(e) => handleContextMenu(e, dashboard)}
              >
                <SelectionCircle
                  isSelected={isSelected()}
                  onClick={(e) => selection.handleClick(dashboard.id, e)}
                />
                <div class="font-700 truncate text-base">{dashboard.title}</div>
                <div class="text-neutral truncate font-mono text-xs">
                  /{dashboard.slug}
                </div>
                <div class="text-neutral flex items-center justify-between text-xs">
                  <span>
                    {dashboard.itemCount} {t3({ en: "items", fr: "éléments" })}
                  </span>
                  <span
                    class={
                      dashboard.isPublic
                        ? "text-success font-700"
                        : "text-neutral"
                    }
                  >
                    {dashboard.isPublic
                      ? t3({ en: "Public", fr: "Public" })
                      : t3({
                          en: "Auth required",
                          fr: "Authentification requise",
                        })}
                  </span>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </FrameTop>
  );
}
