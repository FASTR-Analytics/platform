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
import { Match, Show, Switch, createSignal, For, onMount } from "solid-js";
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
  const [userRoleExists, setUserRoleExists] = createSignal<boolean | null>(null);

  // only fetch the existing permissions if modifying a single users permissions
  onMount(async () => {
    if (p.users.length === 1) {
      const res = await serverActions.getProjectUserPermissions({
        projectId: p.projectId,
        email: p.users[0].email,
      });
      console.log("getProjectUserPermissions response:", res);
      if (res.success) {
        setPermissions(res.data.permissions);
        setUserRoleExists(true);
      } else {
        setPermissions(makeDefaultPermissions());
        setUserRoleExists(false);
      }
    } else {
      setPermissions(makeDefaultPermissions());
      setUserRoleExists(true); // For multiple users, assume they have roles
    }
  });

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

  const addUserRole = timActionForm(
    async () => {
      return serverActions.addProjectUserRole({
        projectId: p.projectId,
        email: p.users[0].email,
      });
    },
    async () => {
      setUserRoleExists(true);
      await p.silentFetch();
    },
  );

  const removeUserRole = timActionForm(
    async () => {
      return serverActions.removeProjectUserRole({
        projectId: p.projectId,
        email: p.users[0].email,
      });
    },
    async () => {
      setUserRoleExists(false);
      setPermissions(makeDefaultPermissions());
      await p.silentFetch();
    },
  );

  return (
    <div class="ui-pad ui-spy w-[400px]">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg leading-6">
            {t2(T.FRENCH_UI_STRINGS.update_project_permissions)}
          </div>
          <Show when={p.users.length === 1}>
            <Show
              when={userRoleExists()}
              fallback={
                <Button
                  onClick={addUserRole.click}
                  intent="success"
                  state={addUserRole.state()}
                  iconName="user-plus"
                  size="sm"
                >
                  Add to project
                </Button>
              }
            >
              <Button
                onClick={removeUserRole.click}
                intent="danger"
                state={removeUserRole.state()}
                iconName="user-minus"
                size="sm"
              >
                Remove from project
              </Button>
            </Show>
          </Show>
        </div>
        <div class="font-700 text-sm">
          {p.users.map((u) => u.email).join(", ")}
        </div>
        <Show when={permissions() && userRoleExists() !== null} fallback={<div>Loading...</div>}>
          {() => (
            <div
              class="space-y-2"
              classList={{
                "opacity-50 pointer-events-none": userRoleExists() === false,
              }}
            >
              <For each={PROJECT_PERMISSIONS}>
                {(key: ProjectPermission) => (
                  <Checkbox
                    label={key.replaceAll("_", " ")}
                    checked={permissions()![key]}
                    onChange={() => togglePermission(key)}
                    disabled={userRoleExists() === false}
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
