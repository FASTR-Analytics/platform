import { clear } from "idb-keyval";
import { t, t2, T } from "lib";
import {
  Button,
  ModalContainer,
  SettingsSection,
  StateHolderWrapper,
  timActionButton,
  timQuery,
  type AlertComponentProps,
} from "panther";
import { serverActions } from "~/server_actions";

export function ProfileForm(
  p: AlertComponentProps<
    {
      attemptSignOut: () => Promise<void>;
    },
    undefined
  >,
) {
  const userDetails = timQuery(
    () => serverActions.getCurrentUser({}),
    t("Loading your profile..."),
  );

  const clearCache = timActionButton(
    async () => {
      await new Promise((res) => setTimeout(res, 1000));
      await clear();
      return { success: true };
    },
    () => window.location.reload(),
  );

  return (
    <ModalContainer
      title={t("Your profile")}
      width="lg"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            Done
          </Button>,
          <Button onClick={p.attemptSignOut} outline iconName="arrowLeft">
            {t("Sign out")}
          </Button>,
        ]
      }
    >
      <StateHolderWrapper state={userDetails.state()}>
        {(keyedUser) => {
          return (
            <>
              <div class="ui-gap flex text-sm">
                <div class="flex-1">
                  <SettingsSection header={t("User details")}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("First name")}:</div>
                      <div class="flex-1">{keyedUser.firstName}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Last name")}:</div>
                      <div class="flex-1">{keyedUser.lastName}</div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection header={t2(T.FRENCH_UI_STRINGS.login_details)}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t2(T.FRENCH_UI_STRINGS.email)}:</div>
                      <div class="flex-1">{keyedUser.email}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t("Password")}:</div>
                      <div class="flex-1">- - - -</div>
                    </div>
                  </SettingsSection>
                </div>
              </div>

              <SettingsSection
                header={t("Cache management")}
                rightChildren={
                  <Button
                    onClick={clearCache.click}
                    state={clearCache.state()}
                    outline
                    iconName="trash"
                  >
                    {t("Clear cache")}
                  </Button>
                }
              >
                {null}
              </SettingsSection>
            </>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
