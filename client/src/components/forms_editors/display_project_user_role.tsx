import type { ProjectPermission, ProjectUser } from "lib";
import { AlertComponentProps, Button, ModalContainer } from "panther";
import { createSignal, onMount, Show, For } from "solid-js";
import { serverActions } from "~/server_actions";
import { t3, TC } from "lib";

const PERMISSION_LABELS: Partial<Record<ProjectPermission, string>> = {
  can_configure_visualizations: t3({ en: "can create and edit visualizations", fr: "peut créer et modifier les visualisations" }),
  can_view_visualizations: t3({ en: "can view visualizations", fr: "peut voir les visualisations" }),
  can_configure_reports: t3({ en: "can create and edit reports", fr: "peut créer et modifier les rapports" }),
  can_view_reports: t3({ en: "can view reports", fr: "peut voir les rapports" }),
  can_configure_slide_decks: t3({ en: "can create and edit slide decks", fr: "peut créer et modifier les présentations" }),
  can_view_slide_decks: t3({ en: "can view slide decks", fr: "peut voir les présentations" }),
};

function getPermissionLabel(key: ProjectPermission): string {
  return PERMISSION_LABELS[key] ?? key.replaceAll("_", " ");
}

const PERMISSION_CATEGORIES: {
  label: string;
  permissions: readonly ProjectPermission[];
}[] = [
  {
    label: t3({ en: "Analytical Products", fr: "Produits analytiques" }),
    permissions: [
      "can_view_visualizations",
      "can_configure_visualizations",
      "can_view_reports",
      "can_configure_reports",
      "can_view_slide_decks",
      "can_configure_slide_decks",
    ],
  },
  {
    label: t3({ en: "Data & Modules", fr: "Données et modules" }),
    permissions: [
      "can_configure_data",
      "can_view_data",
      "can_view_metrics",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: t3({ en: "Project Administration", fr: "Administration du projet" }),
    permissions: [
      "can_configure_settings",
      "can_configure_users",
      "can_view_logs",
      "can_create_backups",
      "can_restore_backups",
    ],
  },
];

export function DisplayProjectUserRole(
  p: AlertComponentProps<
    {
      projectId: string;
      user: ProjectUser;
    },
    undefined
  >,
) {
  const [permissions, setPermissions] = createSignal<Record<
    ProjectPermission,
    boolean
  > | null>(null);
  const [userRoleExists, setUserRoleExists] = createSignal<boolean | null>(
    null,
  );

  onMount(async () => {
    const res = await serverActions.getProjectUserPermissions({
      projectId: p.projectId,
      email: p.user.email,
    });
    if (res.success) {
      setPermissions(res.data.permissions);
      setUserRoleExists(true);
    } else {
      setUserRoleExists(false);
    }
  });

  return (
    <ModalContainer
      width="lg"
      topPanel={
        <div class="space-y-3">
          <div class="font-700 text-lg leading-6">
              {t3({ en: "Permissions", fr: "Permissions" })}
            </div>
            <div class="font-700 text-sm">
              {p.user.email}
            </div>
            <Show
              when={userRoleExists()}
              fallback={<div>{t3(TC.loading)}</div>}
            >
              <Show when={permissions()} fallback={<div>{t3(TC.loading)}</div>}>
                <div class="grid grid-cols-2 gap-4">
                  <For each={PERMISSION_CATEGORIES}>
                    {(category: { label: string; permissions: readonly ProjectPermission[] }) => (
                      <div class="space-y-1">
                        <div class="font-600 text-sm">{category.label}</div>
                        <For each={category.permissions}>
                          {(key: ProjectPermission) => (
                            <div class="flex justify-between">
                              <span>{getPermissionLabel(key)}</span>
                              <span>{permissions()![key] ? "✓" : "✗"}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <Show
        when={userRoleExists()}
        fallback={<div>{t3({ en: "This user does not have access to this project", fr: "Cet utilisateur n'a pas accès à ce projet" })}</div>}
      >
        <Show when={permissions()} fallback={<div>{t3(TC.loading)}</div>}>
          <div class="grid grid-cols-2 gap-4">
            <For each={PERMISSION_CATEGORIES}>
              {(category: {
                label: string;
                permissions: readonly ProjectPermission[];
              }) => (
                <div class="space-y-1">
                  <div class="font-600 text-sm">{category.label}</div>
                  <For each={category.permissions}>
                    {(key: ProjectPermission) => (
                      <div class="flex justify-between">
                        <span>{getPermissionLabel(key)}</span>
                        <span>{permissions()![key] ? "✓" : "✗"}</span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </ModalContainer>
  );
}
