import {
  OtherUser,
  PERMISSION_PRESETS,
  PROJECT_PERMISSIONS,
  type ProjectPermission,
  t3,
  TC,
  UserPermission,
} from "lib";
import {
  Button,
  Checkbox,
  FrameTop,
  HeaderBarCanGoBack,
  SettingsSection,
  timActionButton,
  timActionDelete,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";


export const USER_PERMISSIONS = [
  "can_configure_users",
  "can_view_users",
  "can_view_logs",
  "can_configure_settings",
  "can_configure_assets",
  "can_configure_data",
  "can_view_data",
  "can_create_projects"
] as const satisfies readonly UserPermission[];

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
      "can_view_data",
      "can_configure_data",
      "can_view_metrics",
      "can_view_script_code",
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

type Props = {
  user: OtherUser;
  thisLoggedInUserEmail: string;
  close: () => void;
  silentFetch: () => Promise<void>;
};

function makeDefaultUserPermissions(): Record<UserPermission, boolean> {
  return Object.fromEntries(USER_PERMISSIONS.map((k) => [k, false])) as Record<
    UserPermission,
    boolean
  >;
}

function makeDefaultProjectPermissions(): Record<ProjectPermission, boolean> {
  return Object.fromEntries(
    (PROJECT_PERMISSIONS as readonly ProjectPermission[]).map((k) => [k, false]),
  ) as Record<ProjectPermission, boolean>;
}

export function User(p: Props) {
  const [permissions, setPermissions] = createSignal<Record<UserPermission, boolean> | null>(null);
  const [originalPermissions, setOriginalPermissions] = createSignal<Record<UserPermission, boolean> | null>(null);

  const [defaultProjectPerms, setDefaultProjectPerms] = createSignal<Record<ProjectPermission, boolean> | null>(null);
  const [originalDefaultProjectPerms, setOriginalDefaultProjectPerms] = createSignal<Record<ProjectPermission, boolean> | null>(null);

  // get user permissions
  (async () => {
    const res = await serverActions.getUserPermissions({ email: p.user.email });
    if (res.success) {
      setPermissions(res.data.permissions);
      setOriginalPermissions(res.data.permissions);
    } else {
      setPermissions(makeDefaultUserPermissions());
      setOriginalPermissions(makeDefaultUserPermissions());
    }
  })();

  // get default project permissions
  (async () => {
    const res = await serverActions.getUserDefaultProjectPermissions({ email: p.user.email });
    if (res.success) {
      setDefaultProjectPerms(res.data.permissions);
      setOriginalDefaultProjectPerms(res.data.permissions);
    } else {
      setDefaultProjectPerms(makeDefaultProjectPermissions());
      setOriginalDefaultProjectPerms(makeDefaultProjectPermissions());
    }
  })();

  const hasChanges = () => {
    const current = permissions();
    const original = originalPermissions();
    if (!current || !original) return false;
    return USER_PERMISSIONS.some((key) => current[key] !== original[key]);
  };

  const hasDefaultProjectPermsChanges = (): boolean => {
    const current = defaultProjectPerms();
    const original = originalDefaultProjectPerms();
    if (!current || !original) return false;
    return (PROJECT_PERMISSIONS as readonly ProjectPermission[]).some((key) => current[key] !== original[key]);
  };

  const togglePermission = async (key: UserPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key]});
  };

  const toggleDefaultProjectPerm = (key: ProjectPermission) => {
    const current = defaultProjectPerms();
    if (!current) return;
    setDefaultProjectPerms({ ...current, [key]: !current[key] });
  };

  const savePermissions = timActionButton(
    () => {
      const perms = permissions();
      if (!perms) return Promise.resolve({ success: false, err: "No permissions" });
      return serverActions.updateUserPermissions({
        email: p.user.email,
        permissions: perms
      });
    },
    () => {
      setOriginalPermissions(permissions());
    }
  );

  const saveDefaultProjectPerms = timActionButton(
    async () => {
      const perms = defaultProjectPerms();
      if (!perms) return { success: false as const, err: "No permissions" };
      return await serverActions.updateUserDefaultProjectPermissions({
        email: p.user.email,
        permissions: perms,
      });
    },
    () => {
      setOriginalDefaultProjectPerms(defaultProjectPerms());
    }
  );

  const attemptMakeAdmin = timActionButton(
    () =>
      serverActions.toggleUserAdmin({
        emails: [p.user.email],
        makeAdmin: true,
      }),
    () => p.silentFetch(),
  );
  const attemptMakeNonAdmin = timActionButton(
    () =>
      serverActions.toggleUserAdmin({
        emails: [p.user.email],
        makeAdmin: false,
      }),
    () => p.silentFetch(),
  );

  async function attemptDeleteUser() {
    const deleteAction = timActionDelete(
      {
        text: t3({ en: "Are you sure you want to remove this user?", fr: "Êtes-vous sûr de vouloir supprimer cet utilisateur ?" }),
        itemList: [p.user.email],
      },
      () => serverActions.deleteUser({ emails: [p.user.email] }),
      () => p.silentFetch(),
      () => p.close(),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          back={p.close}
          heading={`${t3({ en: "User profile for", fr: "Profil utilisateur de" })} ${p.user.email}`}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <SettingsSection header={t3({ en: "Login details", fr: "Identifiants" })}>
          <div class="flex">
            <div class="w-48 flex-none">{t3(TC.email)}:</div>
            <div class="flex-1">{p.user.email}</div>
          </div>
        </SettingsSection>
        <SettingsSection
          header={t3({ en: "Instance permissions", fr: "Droits d'accès à l'instance" })}
          rightChildren={
            <div class="ui-gap-sm flex">
              <Switch>
                <Match when={p.user.isGlobalAdmin}>
                  <Button
                    onClick={attemptMakeNonAdmin.click}
                    state={attemptMakeNonAdmin.state()}
                    outline
                  >
                    {t3({ en: "Make non-admin", fr: "Retirer le rôle d'administrateur" })}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    onClick={attemptMakeAdmin.click}
                    state={attemptMakeAdmin.state()}
                    outline
                  >
                    {t3({ en: "Make admin", fr: "Attribuer le rôle d'administrateur" })}
                  </Button>
                </Match>
              </Switch>
            </div>
          }
        >
          <div class="flex">
            <div class="w-48 flex-none">{t3({ en: "Instance admin", fr: "Administrateur de l'instance" })}:</div>
            <div class="flex-1">
              {p.user.isGlobalAdmin ? t3({ en: "Yes", fr: "Oui" }) : t3({ en: "No", fr: "Non" })}
            </div>
          </div>
        </SettingsSection>
        <Show when={p.user.isGlobalAdmin === false}>
          <SettingsSection
            header={t3({ en: "User Permissions", fr: "Droits d'accès de l'utilisateur" })}
            rightChildren={
              <Show when={hasChanges()}>
                <Button
                  onClick={savePermissions.click}
                  state={savePermissions.state()}>
                  {t3({ en: "Save Changes", fr: "Sauvegarder les modifications" })}
                </Button>
              </Show>
            }
          >
            <Show when={permissions()} fallback={<div>{t3(TC.loading)}</div>}>
              {(perms) => (
                <div class="space-y-2">
                  <For each={Object.keys(perms()) as UserPermission[]}>
                    {(key) =>(
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
          </SettingsSection>
          <SettingsSection
            header={t3("Default project permissions")}
            rightChildren={
              <Show when={hasDefaultProjectPermsChanges()}>
                <Button
                  onClick={saveDefaultProjectPerms.click}
                  state={saveDefaultProjectPerms.state()}>
                  {t3({ en: "Save Changes", fr: "Sauvegarder les modifications" })}
                </Button>
              </Show>
            }
          >
            <Show when={defaultProjectPerms()} keyed fallback={<div>{t3(TC.loading)}</div>}>
              {(perms) => (
                <div class="ui-spy-sm">
                  <div class="flex gap-2">
                    <For each={PERMISSION_PRESETS}>
                      {(preset) => (
                        <Button
                          onClick={() => setDefaultProjectPerms(structuredClone(preset.permissions))}
                          intent="neutral"
                          size="sm"
                        >
                          {preset.label}
                        </Button>
                      )}
                    </For>
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <For each={PERMISSION_CATEGORIES}>
                      {(category) => (
                        <div class="space-y-2">
                          <div class="font-600 text-sm">{category.label}</div>
                          <For each={category.permissions as ProjectPermission[]}>
                            {(key) => (
                              <Checkbox
                                label={getPermissionLabel(key)}
                                checked={perms[key]}
                                onChange={() => toggleDefaultProjectPerm(key)}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </Show>
          </SettingsSection>
        </Show>
        <Button
          onClick={attemptDeleteUser}
          intent="danger"
          outline
          iconName="trash"
        >
          {t3({ en: "Remove this user", fr: "Supprimer cet utilisateur" })}
        </Button>
      </div>
    </FrameTop>
  );
}
