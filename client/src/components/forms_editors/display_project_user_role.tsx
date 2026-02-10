import type { ProjectPermission, ProjectUser } from "lib";
import { AlertComponentProps, Button } from "panther";
import { createSignal, onMount, Show, For }  from "solid-js";
import { serverActions } from "~/server_actions";
import { t2, T } from "lib";

export const PROJECT_PERMISSIONS = [
  "can_configure_settings",
  "can_create_backups",
  "can_restore_backups",
  "can_configure_modules",
  "can_run_modules",
  "can_configure_users",
  "can_configure_visualizations",
  "can_view_visualizations",
  "can_configure_reports",
  "can_view_reports",
  "can_configure_slide_decks",
  "can_view_slide_decks",
  "can_configure_data",
  "can_view_data",
  "can_view_logs",
] as const satisfies readonly ProjectPermission[];

const PERMISSION_LABELS: Partial<Record<ProjectPermission, string>> = {
  can_configure_visualizations: "can create and edit visualizations",
  can_view_visualizations: "can view visualizations",
  can_configure_reports: "can create and edit reports",
  can_view_reports: "can view reports",
  can_configure_slide_decks: "can create and edit slide decks",
  can_view_slide_decks: "can view slide decks",
};

function getPermissionLabel(key: ProjectPermission): string {
  return PERMISSION_LABELS[key] ?? key.replaceAll("_", " ");
}

const PERMISSION_CATEGORIES: { label: string; permissions: readonly ProjectPermission[] }[] = [
  {
    label: "Analytical Products",
    permissions: ["can_view_visualizations", "can_configure_visualizations",  "can_view_reports", "can_configure_reports", "can_view_slide_decks", "can_configure_slide_decks"],
  },
  {
    label: "Data & Modules",
    permissions: ["can_configure_data", "can_view_data", "can_configure_modules", "can_run_modules"],
  },
  {
    label: "Project Administration",
    permissions: ["can_configure_settings", "can_configure_users", "can_view_logs", "can_create_backups", "can_restore_backups"],
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
    const [permissions, setPermissions] = createSignal<Record<ProjectPermission, boolean> | null>(null);
    const [userRoleExists, setUserRoleExists] = createSignal<boolean | null>(null);

    onMount(async () => {
      const res = await serverActions.getProjectUserPermissions({
        projectId: p.projectId,
        email: p.user.email,
      });
      if (res.success) {
        setPermissions(res.data.permissions);
        setUserRoleExists(true);
      } else{
        setUserRoleExists(false);
      }
    });

    return (
      <div class="ui-pad ui-spy w-[600px]">
        <div class="space-y-3">
          <div class="font-700 text-lg leading-6">
              {t2("Permissions")}
            </div>
            <div class="font-700 text-sm">
              {p.user.email}
            </div>
            <Show
              when={userRoleExists()}
              fallback={<div>Loading...</div>}
            >
              <Show when={permissions()} fallback={<div>Loading...</div>}>
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
        <div class="flex gap-2">

          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t2(T.FRENCH_UI_STRINGS.cancel)}
          </Button>
        </div>
      </div>
    );
}