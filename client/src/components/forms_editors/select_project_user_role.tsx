import type { ProjectPermission } from "lib";
import {
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
  ProjectUser,
  T,
  t2,
} from "lib";
import {
  AlertComponentProps,
  Button,
  Checkbox,
  ModalContainer,
  StateHolderFormError,
  timActionForm,
} from "panther";
import { For, Show, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

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
      setUserRoleExists(true);
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
      if (!perms) return { success: true as const };
      return serverActions.updateProjectUserPermissions({
        projectId: p.projectId,
        emails: p.users.map((u) => u.email),
        permissions: perms,
      });
    },
    async () => {
      await p.silentFetch?.();
      p.close(undefined);
    },
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
      await p.silentFetch?.();
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
      await p.silentFetch?.();
    },
  );

  return (
    <ModalContainer
      width="lg"
      topPanel={
        <div class="flex items-center justify-between">
          <div>
            <div class="font-700 text-lg leading-6">
              {t2(T.FRENCH_UI_STRINGS.update_project_permissions)}
            </div>
            <div class="font-700 text-sm">
              {p.users.map((u) => u.email).join(", ")}
            </div>
          </div>
          <Show when={p.users.length === 1}>
            <Show
              when={userRoleExists()}
              fallback={
                <Button
                  onClick={addUserRole.click}
                  intent="success"
                  state={addUserRole.state()}
                  iconName="userPlus"
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
                iconName="user"
                size="sm"
              >
                Remove from project
              </Button>
            </Show>
          </Show>
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={save.click}
            intent="success"
            state={save.state()}
            iconName="save"
            disabled={userRoleExists() === false}
          >
            {t2(T.FRENCH_UI_STRINGS.save)}
          </Button>,
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t2(T.FRENCH_UI_STRINGS.cancel)}
          </Button>,
        ]
      }
    >
      <Show
        when={permissions() && userRoleExists() !== null}
        fallback={<div>Loading...</div>}
      >
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
                onClick={() =>
                  setPermissions(structuredClone(preset.permissions))
                }
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
      </Show>
      <StateHolderFormError state={save.state()} />
    </ModalContainer>
  );
}
