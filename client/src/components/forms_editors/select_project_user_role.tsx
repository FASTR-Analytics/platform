import { OtherUser, ProjectUser, ProjectUserRoleType, t2, T } from "lib";
import {
  AlertComponentProps,
  Button,
  RadioGroup,
  StateHolderFormError,
  getSelectOptions,
  timActionForm,
  Checkbox,
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

const PERMISSION_CATEGORIES: {
  label: string;
  permissions: readonly ProjectPermission[];
}[] = [
  {
    label: "Analytical Products",
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
    label: "Data & Modules",
    permissions: [
      "can_configure_data",
      "can_view_data",
      "can_configure_modules",
      "can_run_modules",
    ],
  },
  {
    label: "Project Administration",
    permissions: [
      "can_configure_settings",
      "can_configure_users",
      "can_view_logs",
      "can_create_backups",
      "can_restore_backups",
    ],
  },
];

function makeDefaultPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(
    PROJECT_PERMISSIONS.map((k) => [k, false]),
  ) as Record<ProjectPermission, boolean>;
}

const PERMISSION_PRESETS: {
  label: string;
  permissions: Record<ProjectPermission, boolean>;
}[] = [
  {
    label: "Viewer",
    permissions: {
      can_configure_settings: false,
      can_create_backups: false,
      can_restore_backups: false,
      can_configure_modules: false,
      can_run_modules: false,
      can_configure_users: false,
      can_configure_visualizations: false,
      can_view_visualizations: true,
      can_configure_reports: false,
      can_view_reports: true,
      can_configure_slide_decks: false,
      can_view_slide_decks: true,
      can_configure_data: false,
      can_view_data: true,
      can_view_logs: false,
    },
  },
  {
    label: "Editor",
    permissions: {
      can_configure_settings: false,
      can_create_backups: false,
      can_restore_backups: false,
      can_configure_modules: true,
      can_run_modules: true,
      can_configure_users: false,
      can_configure_visualizations: true,
      can_view_visualizations: true,
      can_configure_reports: true,
      can_view_reports: true,
      can_configure_slide_decks: true,
      can_view_slide_decks: true,
      can_configure_data: true,
      can_view_data: true,
      can_view_logs: false,
    },
  },
  {
    label: "Admin",
    permissions: {
      can_configure_settings: true,
      can_create_backups: true,
      can_restore_backups: true,
      can_configure_modules: true,
      can_run_modules: true,
      can_configure_users: true,
      can_configure_visualizations: true,
      can_view_visualizations: true,
      can_configure_reports: true,
      can_view_reports: true,
      can_configure_slide_decks: true,
      can_view_slide_decks: true,
      can_configure_data: true,
      can_view_data: true,
      can_view_logs: true,
    },
  },
];

export function SelectProjectUserRole(
  p: AlertComponentProps<
    {
      projectId: string;
      projectLabel: string;
      users: ProjectUser[];
      silentFetch?: () => Promise<void>;
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
    setPermissions({ ...current, [key]: !current[key] });
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
    <div class="ui-pad ui-spy w-[600px]">
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
        <Show
          when={permissions() && userRoleExists() !== null}
          fallback={<div>Loading...</div>}
        >
          {() => (
            <>
              <div
                class="flex gap-2"
                classList={{
                  "opacity-50 pointer-events-none": userRoleExists() === false,
                }}
              >
                <For each={PERMISSION_PRESETS}>
                  {(preset: {
                    label: string;
                    permissions: Record<ProjectPermission, boolean>;
                  }) => (
                    <Button
                      onClick={() => setPermissions({ ...preset.permissions })}
                      intent="neutral"
                      size="sm"
                    >
                      {preset.label}
                    </Button>
                  )}
                </For>
              </div>
              <div
                class="grid grid-cols-2 gap-4"
                classList={{
                  "opacity-50 pointer-events-none": userRoleExists() === false,
                }}
              >
                <For each={PERMISSION_CATEGORIES}>
                  {(category: {
                    label: string;
                    permissions: readonly ProjectPermission[];
                  }) => (
                    <div class="space-y-2">
                      <div class="font-600 text-sm">{category.label}</div>
                      <For each={category.permissions}>
                        {(key: ProjectPermission) => (
                          <Checkbox
                            label={getPermissionLabel(key)}
                            checked={permissions()![key]}
                            onChange={() => togglePermission(key)}
                            disabled={userRoleExists() === false}
                          />
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </>
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
          disabled={userRoleExists() === false}
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
