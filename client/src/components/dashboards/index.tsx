import { DashboardSummary, t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
  timActionDelete,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import { serverActions } from "~/server_actions";
import { CreateDashboardModal } from "./create_dashboard_modal";
import { DashboardEditor } from "./dashboard_editor";

type Props = {
  isGlobalAdmin: boolean;
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

  async function openDashboard(dashboardId: string, title: string) {
    await p.openProjectEditor({
      element: DashboardEditor,
      props: {
        projectId: projectState.id,
        dashboardId,
        title,
        isGlobalAdmin: p.isGlobalAdmin,
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

  async function attemptDelete(dashboard: DashboardSummary) {
    const deleteAction = timActionDelete(
      t3({
        en: `Are you sure you want to delete "${dashboard.title}"?`,
        fr: `Êtes-vous sûr de vouloir supprimer « ${dashboard.title} » ?`,
      }),
      async () =>
        serverActions.deleteDashboard({
          projectId: projectState.id,
          dashboard_id: dashboard.id,
        }),
    );
    await deleteAction.click();
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
      <div class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] content-start items-start overflow-auto">
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
          {(dashboard) => (
            <div class="border-base-300 ui-spy hover:border-primary cursor-pointer rounded-md border p-3 transition-colors">
              <div
                class="ui-spy"
                onClick={() => openDashboard(dashboard.id, dashboard.title)}
              >
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
              <Show when={canConfigure()}>
                <div class="flex justify-end">
                  <Button
                    size="sm"
                    intent="danger"
                    outline
                    iconName="trash"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      attemptDelete(dashboard);
                    }}
                  />
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </FrameTop>
  );
}
