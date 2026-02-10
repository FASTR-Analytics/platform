import { OtherUser, t3, TC, UserPermission } from "lib";
import {
  Button,
  FrameTop,
  HeaderBarCanGoBack,
  SettingsSection,
  timActionDelete,
  timActionButton,
  Checkbox
} from "panther";
import { Match, Switch, Show, createSignal, For } from "solid-js";
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


type Props = {
  user: OtherUser;
  thisLoggedInUserEmail: string;
  close: () => void;
  silentFetch: () => Promise<void>;
};

function makeDefaultPermissions(): Record<UserPermission, boolean> {
  return Object.fromEntries(USER_PERMISSIONS.map((k) => [k, false])) as Record<
    UserPermission,
    boolean
  >;
}

export function User(p: Props) {
  const [permissions, setPermissions] = createSignal<Record<UserPermission, boolean> | null>(null);
  const [originalPermissions, setOriginalPermissions] = createSignal<Record<UserPermission, boolean> | null>(null);

  // get user permissions
  (async () => {
    const res = await serverActions.getUserPermissions({ email: p.user.email });
    if (res.success) {
      setPermissions(res.data.permissions);
      setOriginalPermissions(res.data.permissions);
    } else {
      setPermissions(makeDefaultPermissions());
      setOriginalPermissions(makeDefaultPermissions());
    }
  })();

  const hasChanges = () => {
    const current = permissions();
    const original = originalPermissions();
    if (!current || !original) return false;
    return USER_PERMISSIONS.some((key) => current[key] !== original[key]);
  };

  const togglePermission = async (key: UserPermission) => {
    const current = permissions();
    if (!current) return;
    setPermissions({ ...current, [key]: !current[key]});
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
