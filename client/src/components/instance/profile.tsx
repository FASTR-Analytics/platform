import { clearDataCache, clearAiChatCache } from "~/state/clear_caches";
import { clerk } from "~/components/LoggedInWrapper";
import { t3, TC } from "lib";
import {
  Button,
  Checkbox,
  Input,
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

  const aiUsage = timQuery(
    () => serverActions.getAiUsage({}),
    t3({ en: "Loading AI usage...", fr: "Chargement de l'utilisation IA..." }),
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
          const [organisation, setOrganisation] = createSignal(
            keyedUser.organisation ?? "",
          );

          const saveOrganisation = timActionButton(
            () => serverActions.updateMyOrganisation({ organisation: organisation() }),
          );

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

              {/* Organisation */}
              <SettingsSection
                header={t3({ en: "Organisation", fr: "Organisation" })}
                rightChildren={
                  <Button
                    onClick={saveOrganisation.click}
                    state={saveOrganisation.state()}
                    intent="primary"
                    outline
                  >
                    {t3({ en: "Save", fr: "Enregistrer" })}
                  </Button>
                }
              >
                <Input
                  value={organisation()}
                  onChange={setOrganisation}
                  placeholder={t3({ en: "Organisation name", fr: "Nom de l'organisation" })}
                />
              </SettingsSection>

              {/* AI usage */}
              <SettingsSection
                header={t3({ en: "AI usage today", fr: "Utilisation IA aujourd'hui" })}
              >
                <StateHolderWrapper state={aiUsage.state()} noPad>
                  {(usage) => {
                    const pct = usage.dailyTokenLimit !== null
                      ? Math.min(100, Math.round((usage.tokensUsedToday / usage.dailyTokenLimit) * 100))
                      : null;
                    return (
                      <div class="flex flex-col gap-2">
                        {pct !== null && (
                          <div class="bg-base-200 h-2 w-full overflow-hidden rounded-full">
                            <div
                              class={`h-full rounded-full transition-all ${pct >= 80 ? "bg-warning" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                        <div class="text-neutral text-sm">
                          {usage.tokensUsedToday.toLocaleString()}{" "}
                          {usage.dailyTokenLimit !== null
                            ? `/ ${usage.dailyTokenLimit.toLocaleString()} ${t3({ en: "tokens", fr: "tokens" })} (${pct}%)`
                            : t3({ en: "tokens used today · Unlimited", fr: "tokens utilisés aujourd'hui · Illimité" })}
                        </div>
                      </div>
                    );
                  }}
                </StateHolderWrapper>
              </SettingsSection>

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
