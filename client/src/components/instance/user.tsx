import { OtherUser, t, t2, T } from "lib";
import {
  Button,
  FrameTop,
  HeaderBarCanGoBack,
  SettingsSection,
  timActionDelete,
  timActionButton,
} from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  user: OtherUser;
  thisLoggedInUserEmail: string;
  close: () => void;
  silentFetch: () => Promise<void>;
};

export function User(p: Props) {
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
