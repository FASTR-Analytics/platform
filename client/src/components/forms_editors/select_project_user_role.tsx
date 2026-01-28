import { OtherUser, ProjectUser, ProjectUserRoleType, t2, T } from "lib";
import {
  AlertComponentProps,
  Button,
  RadioGroup,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
  Checkbox
} from "panther";
import { Match, Show, Switch, createSignal, For } from "solid-js";
import { serverActions } from "~/server_actions";
import { t } from "lib";
import { ProjectPermission } from "../../../../lib/types/mod.ts";
import { userRouteRegistry } from "../../../../lib/api-routes/instance/users.ts";

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

function makeDefaultPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(PROJECT_PERMISSIONS.map((k) => [k, false])) as Record<
    ProjectPermission,
    boolean
  >;
}


export function SelectProjectUserRole(
  p: AlertComponentProps<
    {
      projectId: string;
      projectLabel: string;
      users: ProjectUser[];
      silentFetch: () => Promise<void>;
    },
    undefined
  >,
) {
  const [permissions, setPermissions] = createSignal<Record<ProjectPermission, boolean> | null>(null);
  
  // only fetch the existing permissions if modifying a single users permissions
  if(!(p.users.length > 1)){
    (async () => {
      const res = await serverActions.getProjectUserPermissions({
        projectId: p.projectId,
        email: p.users[0].email,
      });
      if (res.success) {
        setPermissions(res.data.permissions);
      } else {
        setPermissions(makeDefaultPermissions());
      }
    })();
  }else {
    setPermissions(makeDefaultPermissions());
  }

  const togglePermission = (key: ProjectPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key]});
  };



  const save = timActionForm(
    async () => {
      const perms = permissions();
      if (!perms) return;
      return serverActions.updateProjectUserPermissions({
        projectId: p.projectId,
        emails: p.users.map((u) => u.email),
        permissions: perms,
      });
    },
    p.silentFetch,
    () => p.close(undefined),
  );

  return (
    <div class="ui-pad ui-spy w-[400px]">
      <div class="space-y-3">
        <div class="font-700 text-lg leading-6">
          {t2(T.FRENCH_UI_STRINGS.update_project_permissions)}
        </div>
        <div class="font-700 text-sm">
          {p.users.map((u) => u.email).join(", ")}
        </div>
        <Show when={permissions()} fallback={<div>Loading...</div>}>
          {(perms) => (
            <div class="space-y-2">
              <For each={Object.keys(perms()) as ProjectPermission[]}>
                {(key) => (
                  <Checkbox
                    label={key.replaceAll("_", " ")}
                    checked={perms()[key]}
                    onChange={() => togglePermission(key)}
                  />
                )}
              </For>
            </div>
          )}
        </Show>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="flex gap-2">
        {/* <Show when={!p.user.isGlobalAdmin}> */}
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
        {/* </Show> */}
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
