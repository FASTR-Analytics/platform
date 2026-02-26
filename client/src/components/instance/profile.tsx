import { clearDataCache, clearAiChatCache } from "~/state/clear_data_cache";
import { t3, TC } from "lib";
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
    t3({ en: "Loading your profile...", fr: "Chargement de votre profil..." }),
  );

  const clearCache = timActionButton(
    async () => {
      await clearDataCache();
      return { success: true };
    },
    () => window.location.reload(),
  );

  const clearAiChat = timActionButton(
    async () => {
      await clearAiChatCache();
      return { success: true };
    },
    () => window.location.reload(),
  );

  return (
    <ModalContainer
      title={t3({ en: "Your profile", fr: "Votre profil" })}
      width="lg"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3(TC.done)}
          </Button>,
          <Button onClick={p.attemptSignOut} outline iconName="arrowLeft">
            {t3({ en: "Sign out", fr: "Se déconnecter" })}
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
                  <SettingsSection header={t3({ en: "User details", fr: "Détails de l'utilisateur" })}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t3({ en: "First name", fr: "Prénom" })}:</div>
                      <div class="flex-1">{keyedUser.firstName}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t3({ en: "Last name", fr: "Nom" })}:</div>
                      <div class="flex-1">{keyedUser.lastName}</div>
                    </div>
                  </SettingsSection>
                </div>
                <div class="flex-1">
                  <SettingsSection header={t3({ en: "Login details", fr: "Identifiants" })}>
                    <div class="flex">
                      <div class="w-36 flex-none">{t3(TC.email)}:</div>
                      <div class="flex-1">{keyedUser.email}</div>
                    </div>
                    <div class="flex">
                      <div class="w-36 flex-none">{t3({ en: "Password", fr: "Mot de passe" })}:</div>
                      <div class="flex-1">- - - -</div>
                    </div>
                  </SettingsSection>
                </div>
              </div>

              <SettingsSection
                header={t3({ en: "Cache management", fr: "Gestion du cache" })}
                rightChildren={
                  <div class="ui-gap-sm flex">
                    <Button
                      onClick={clearCache.click}
                      state={clearCache.state()}
                      outline
                      iconName="trash"
                    >
                      {t3({ en: "Clear data cache", fr: "Vider le cache de données" })}
                    </Button>
                    <Button
                      onClick={clearAiChat.click}
                      state={clearAiChat.state()}
                      outline
                      iconName="trash"
                    >
                      {t3({ en: "Clear AI chat history", fr: "Vider l'historique IA" })}
                    </Button>
                  </div>
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
