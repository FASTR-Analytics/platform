import { OtherUser, t, t2, T, UserPermission } from "lib";
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
        text: t("Are you sure you want to remove this user?"),
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
          heading={`${t2(T.FRENCH_UI_STRINGS.user_profile_for)} ${p.user.email}`}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <SettingsSection header={t2(T.FRENCH_UI_STRINGS.login_details)}>
          <div class="flex">
            <div class="w-48 flex-none">{t2(T.FRENCH_UI_STRINGS.email)}:</div>
            <div class="flex-1">{p.user.email}</div>
          </div>
        </SettingsSection>
        <SettingsSection
          header={t2(T.FRENCH_UI_STRINGS.instance_permissions)}
          rightChildren={
            <div class="ui-gap-sm flex">
              <Switch>
                <Match when={p.user.isGlobalAdmin}>
                  <Button
                    onClick={attemptMakeNonAdmin.click}
                    state={attemptMakeNonAdmin.state()}
                    outline
                  >
                    {t2(T.FRENCH_UI_STRINGS.make_nonadmin)}
                  </Button>
                </Match>
                <Match when={true}>
                  <Button
                    onClick={attemptMakeAdmin.click}
                    state={attemptMakeAdmin.state()}
                    outline
                  >
                    {t2(T.FRENCH_UI_STRINGS.make_admin)}
                  </Button>
                </Match>
              </Switch>
            </div>
          }
        >
          <div class="flex">
            <div class="w-48 flex-none">{t2(T.FRENCH_UI_STRINGS.instance_admin)}:</div>
            <div class="flex-1">
              {p.user.isGlobalAdmin ? t2(T.FRENCH_UI_STRINGS.yes) : t2(T.FRENCH_UI_STRINGS.no)}
            </div>
          </div>
        </SettingsSection>
        <Show when={p.user.isGlobalAdmin === false}>
          <SettingsSection
            header={t2("User Permissions")}
            rightChildren={
              <Show when={hasChanges()}>
                <Button
                  onClick={savePermissions.click}
                  state={savePermissions.state()}>
                  {t2("Save Changes")}
                </Button>
              </Show>
            }
          >
            <Show when={permissions()} fallback={<div>Loading...</div>}>
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
          {t2(T.FRENCH_UI_STRINGS.remove_this_user)}
        </Button>
      </div>
    </FrameTop>
  );
}
