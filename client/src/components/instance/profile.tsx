import { clearDataCache, clearAiChatCache } from "~/state/clear_caches";
import { clerk } from "~/components/LoggedInWrapper";
import { t3, TC } from "lib";
import {
  Button,
  Checkbox,
  TextArea,
  ModalContainer,
  SettingsSection,
  StateHolderWrapper,
  createButtonAction,
  createQuery,
  type AlertComponentProps,
} from "panther";
import { serverActions } from "~/server_actions";
import { createSignal, Show } from "solid-js";

export function ProfileForm(
  p: AlertComponentProps<
    {
      attemptSignOut: () => Promise<void>;
    },
    undefined
  >,
) {
  const userDetails = createQuery(
    () => serverActions.getCurrentUser({}),
    t3({ en: "Loading your profile...", fr: "Chargement de votre profil...", pt: "A carregar o seu perfil..." }),
  );

  const aiUsage = createQuery(
    () => serverActions.getAiUsage({}),
    t3({ en: "Loading AI usage...", fr: "Chargement de l'utilisation IA...", pt: "A carregar a utilização de IA..." }),
  );

  const clearCache = createButtonAction(
    async () => {
      await clearDataCache();
      return { success: true };
    },
    () => window.location.reload(),
  );

  const clearAiChat = createButtonAction(
    async () => {
      await clearAiChatCache();
      return { success: true };
    },
    () => window.location.reload(),
  );

  return (
    <ModalContainer
      title={t3({ en: "Your profile", fr: "Votre profil", pt: "O seu perfil" })}
      width="lg"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3(TC.done)}
          </Button>,
          <Button onClick={p.attemptSignOut} outline iconName="arrowLeft">
            {t3({ en: "Sign out", fr: "Se déconnecter", pt: "Terminar sessão" })}
          </Button>,
        ]
      }
    >
      <StateHolderWrapper state={userDetails.state()} noPad>
        {(keyedUser) => {
          const [organisation, setOrganisation] = createSignal(
            (clerk.user?.unsafeMetadata?.organisation as string | undefined) ?? "",
          );

          const [editingOrganisation, setEditingOrganisation] = createSignal(false);

          const saveOrganisation = createButtonAction(async () => {
            await clerk.user?.update({
              unsafeMetadata: {
                ...clerk.user.unsafeMetadata,
                organisation: organisation(),
              },
            });
            setEditingOrganisation(false);
            return { success: true };
          });

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
              <div class="border-border flex flex-col items-center gap-3 border-b pt-2 pb-6">
                {clerk.user?.imageUrl && (
                  <button
                    type="button"
                    class="hover:ring-primary cursor-pointer rounded-full ring-2 ring-transparent transition"
                    onClick={() => clerk.openUserProfile()}
                    title={t3({ en: "Manage account", fr: "Gérer le compte", pt: "Gerir a conta" })}
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
                  <div class="text-base-content-muted text-sm">{keyedUser.email}</div>
                  <button
                    type="button"
                    class="text-primary mt-1 cursor-pointer text-xs hover:underline"
                    onClick={() => clerk.openUserProfile()}
                  >
                    {t3({ en: "Manage account", fr: "Gérer le compte", pt: "Gerir a conta" })}
                  </button>
                </div>
              </div>

              {/* Organisation */}
              <SettingsSection
                header={t3({ en: "Organisation", fr: "Organisation", pt: "Organização" })}
              >
                <Show
                  when={editingOrganisation()}
                  fallback={
                    <div class="flex items-center gap-2">
                      <span class="text-base-content-muted text-sm flex-1">
                        {organisation() || <span class="text-base-content-muted">{t3({ en: "Not set", fr: "Non défini", pt: "Não definido" })}</span>}
                      </span>
                      <Button onClick={() => setEditingOrganisation(true)} outline size="sm" iconName="pencil">
                        {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
                      </Button>
                    </div>
                  }
                >
                  <div class="flex items-center gap-2">
                    <TextArea
                      value={organisation()}
                      onChange={setOrganisation}
                      placeholder={t3({ en: "Organisation name", fr: "Nom de l'organisation", pt: "Nome da organização" })}
                      fullWidth
                      rows={1}
                      size="sm"
                      autoFocus
                    />
                    <Button
                      onClick={saveOrganisation.click}
                      state={saveOrganisation.state()}
                      intent="primary"
                      outline
                    >
                      {t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })}
                    </Button>
                    <Button onClick={() => setEditingOrganisation(false)} intent="neutral" outline>
                      {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                    </Button>
                  </div>
                </Show>
              </SettingsSection>

              {/* AI usage */}
              <SettingsSection
                header={t3({ en: "AI usage today", fr: "Utilisation IA aujourd'hui", pt: "Utilização de IA hoje" })}
              >
                <StateHolderWrapper state={aiUsage.state()} noPad>
                  {(usage) => {
                    const pct = !usage.isUnlimited && usage.dailyTokenLimit !== null
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
                        <div class="text-base-content-muted text-sm">
                          {usage.isUnlimited
                            ? t3({ en: "Unlimited", fr: "Illimité", pt: "Ilimitado" })
                            : <>
                                {usage.tokensUsedToday.toLocaleString()}{" "}
                                {usage.dailyTokenLimit !== null
                                  ? `/ ${usage.dailyTokenLimit.toLocaleString()} ${t3({ en: "tokens", fr: "tokens", pt: "tokens" })} (${pct}%)`
                                  : t3({ en: "tokens used today · Unlimited", fr: "tokens utilisés aujourd'hui · Illimité", pt: "tokens utilizados hoje · Ilimitado" })}
                              </>
                          }
                        </div>
                      </div>
                    );
                  }}
                </StateHolderWrapper>
              </SettingsSection>

              {/* AI usage this week */}
              <SettingsSection
                header={t3({ en: "AI usage this week (country)", fr: "Utilisation IA cette semaine (pays)", pt: "Utilização de IA esta semana (país)" })}
              >
                <StateHolderWrapper state={aiUsage.state()} noPad>
                  {(usage) => {
                    const pct = usage.weeklyTokenLimit !== null
                      ? Math.min(100, Math.round((usage.tokensUsedThisWeek / usage.weeklyTokenLimit) * 100))
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
                        <div class="text-base-content-muted text-sm">
                          {usage.tokensUsedThisWeek.toLocaleString()}{" "}
                          {usage.weeklyTokenLimit !== null
                            ? `/ ${usage.weeklyTokenLimit.toLocaleString()} ${t3({ en: "tokens", fr: "tokens", pt: "tokens" })} (${pct}%)`
                            : t3({ en: "tokens used this week · Unlimited", fr: "tokens utilisés cette semaine · Illimité", pt: "tokens utilizados esta semana · Ilimitado" })}
                        </div>
                      </div>
                    );
                  }}
                </StateHolderWrapper>
              </SettingsSection>

              {/* Mailing list */}
              <SettingsSection
                header={t3({ en: "Mailing list", fr: "Liste de diffusion", pt: "Lista de distribuição" })}
              >
                <Checkbox
                  checked={optedIn()}
                  onChange={toggleOptIn}
                  label={t3({
                    en: "Receive email updates and announcements",
                    fr: "Recevoir des mises à jour et annonces par email",
                    pt: "Receber atualizações e anúncios por email",
                  })}
                />
              </SettingsSection>

              {/* Cache management */}
              <SettingsSection
                header={t3({ en: "Cache management", fr: "Gestion du cache", pt: "Gestão da cache" })}
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
                        pt: "Limpar a cache de dados",
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
                        pt: "Limpar o histórico de conversas de IA",
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
