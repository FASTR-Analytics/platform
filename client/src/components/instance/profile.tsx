import { clearDataCache, clearAiChatCache } from "~/state/clear_data_cache";
import { clerk } from "~/components/LoggedInWrapper";
import { t3, TC } from "lib";
import {
  Button,
  Checkbox,
  ModalContainer,
  SettingsSection,
  StateHolderWrapper,
  timActionButton,
  timQuery,
  type AlertComponentProps,
} from "panther";
import { serverActions } from "~/server_actions";
import { createSignal } from "solid-js";

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
      <StateHolderWrapper state={userDetails.state()} noPad>
        {(keyedUser) => {
          const [optedIn, setOptedIn] = createSignal(
            clerk.user?.unsafeMetadata?.emailOptIn === true,
          );

          async function toggleOptIn(next: boolean) {
            setOptedIn(next);
            await clerk.user?.update({
              unsafeMetadata: {
                ...clerk.user.unsafeMetadata,
                emailOptIn: next,
                emailOptInAsked: true,
              },
            });
          }

          return (
            <>
              {/* Hero */}
              <div class="border-base-300 flex flex-col items-center gap-3 border-b pt-2 pb-6">
                {clerk.user?.imageUrl && (
                  <button
                    type="button"
                    class="hover:ring-primary cursor-pointer rounded-full ring-2 ring-transparent transition"
                    onClick={() => clerk.openUserProfile()}
                    title={t3({ en: "Manage account", fr: "Gérer le compte" })}
                  >
                    <img
                      src={clerk.user.imageUrl}
                      alt={keyedUser.firstName ?? ""}
                      class="h-20 w-20 rounded-full"
                    />
                  </button>
                )}
                <div class="flex flex-col items-center gap-1">
                  <div class="font-700 text-base-content text-base">
                    {[keyedUser.firstName, keyedUser.lastName]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </div>
                  <div class="text-neutral text-sm">{keyedUser.email}</div>
                  <button
                    type="button"
                    class="text-primary mt-1 cursor-pointer text-xs hover:underline"
                    onClick={() => clerk.openUserProfile()}
                  >
                    {t3({ en: "Manage account", fr: "Gérer le compte" })}
                  </button>
                </div>
              </div>

              {/* Mailing list */}
              <SettingsSection
                header={t3({ en: "Mailing list", fr: "Liste de diffusion" })}
              >
                <Checkbox
                  checked={optedIn()}
                  onChange={toggleOptIn}
                  label={t3({
                    en: "Receive email updates and announcements",
                    fr: "Recevoir des mises à jour et annonces par email",
                  })}
                />
              </SettingsSection>

              {/* Cache management */}
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
                      {t3({
                        en: "Clear data cache",
                        fr: "Vider le cache de données",
                      })}
                    </Button>
                    <Button
                      onClick={clearAiChat.click}
                      state={clearAiChat.state()}
                      outline
                      iconName="trash"
                    >
                      {t3({
                        en: "Clear AI chat history",
                        fr: "Vider l'historique IA",
                      })}
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
