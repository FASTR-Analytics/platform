import { permission } from "node:process";
import { ProjectPermission, ProjectUser } from "../../../../lib/types/mod.ts";
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
  "can_configure_visulizations",
  "can_configure_reports",
  "can_configure_data",
  "can_view_data",
  "can_view_logs",
] as const satisfies readonly ProjectPermission[];

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
      <div class="ui-pad ui-spy w-[400px]">
        <div class="space-y-3">
          <div class="font-700 text-lg leading-6">
              {t2("Permissions")}
            </div>
            <Show
              when={userRoleExists()}
              fallback={<div>This user does not have access to this project</div>}
            >
              <Show when={permissions()} fallback={<div>Loading...</div>}>
                <div class="space-y-1">
                  <For each={PROJECT_PERMISSIONS}>
                    {(key: ProjectPermission) => (
                      <div class="flex justify-between">
                        <span>{key}</span>
                        <span>{permissions()![key] ? "✓" : "✗"}</span>
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