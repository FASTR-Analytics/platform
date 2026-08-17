import { clearDataCache, clearAiChatCache } from "~/state/clear_caches";
import { darkMode, schemePref, setScheme } from "~/state/t4_ui";
import { clerk } from "~/components/LoggedInWrapper";
import { t3, TC } from "lib";
import {
  Button,
  ButtonGroup,
  Checkbox,
  TextArea,
  ModalContainer,
  Card,
  StateHolderWrapper,
  createButtonAction,
  createQuery,
  openComponent,
  KEY_COLOR_THEMES,
  type AlertComponentProps,
} from "panther";
import { ChangeEmailModal } from "./change_email_modal";
import { serverActions } from "~/server_actions";
import { createSignal, Show } from "solid-js";

// The one panther dark palette — same source as the CSS pairs and the canvas
// dark companion.
const DARK_THEME_COLORS = KEY_COLOR_THEMES["panther-default-dark"].colors;

// Clerk's account window renders in its own portal with Clerk's own styling,
// so the app's CSS tokens don't reach it. Pass dark appearance variables at
// open time — evaluated per open, so it follows the scheme active when the
// window is launched (including OS-driven "system" dark).
function openClerkUserProfile() {
  clerk.openUserProfile(
    darkMode()
      ? {
          appearance: {
            variables: {
              colorBackground: DARK_THEME_COLORS.base100,
              colorText: DARK_THEME_COLORS.baseContent,
              colorTextSecondary: DARK_THEME_COLORS.neutral,
              colorNeutral: DARK_THEME_COLORS.baseContent,
              colorInputBackground: DARK_THEME_COLORS.base200,
              colorInputText: DARK_THEME_COLORS.baseContent,
              colorPrimary: DARK_THEME_COLORS.primary,
              colorTextOnPrimaryBackground: DARK_THEME_COLORS.primaryContent,
              colorDanger: DARK_THEME_COLORS.danger,
              colorSuccess: DARK_THEME_COLORS.success,
              colorWarning: DARK_THEME_COLORS.warning,
            },
          },
        }
      : undefined,
  );
}

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
    t3({
      en: "Loading your profile...",
      fr: "Chargement de votre profil...",
      pt: "A carregar o seu perfil...",
    }),
  );

  const aiUsage = createQuery(
    () => serverActions.getAiUsage({}),
    t3({
      en: "Loading AI usage...",
      fr: "Chargement de l'utilisation IA...",
      pt: "A carregar a utilização de IA...",
    }),
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
            {t3({
              en: "Sign out",
              fr: "Se déconnecter",
              pt: "Terminar sessão",
            })}
          </Button>,
        ]
      }
    >
      <StateHolderWrapper state={userDetails.state()} noPad>
        {(keyedUser) => {
          const [organisation, setOrganisation] = createSignal(
            (clerk.user?.unsafeMetadata?.organisation as string | undefined) ??
              "",
          );

          const [editingOrganisation, setEditingOrganisation] =
            createSignal(false);

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
              <div class="flex flex-col items-center gap-3 border-b pt-2 pb-6">
                {clerk.user?.imageUrl && (
                  <button
                    type="button"
                    class="hover:ring-primary cursor-pointer rounded-full ring-2 ring-transparent transition"
                    onClick={() => openClerkUserProfile()}
                    title={t3({
                      en: "Manage account",
                      fr: "Gérer le compte",
                      pt: "Gerir a conta",
                    })}
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
                  <div class="text-base-content-muted text-sm">
                    {keyedUser.email}
                  </div>
                  <button
                    type="button"
                    class="text-primary mt-1 cursor-pointer text-xs hover:underline"
                    onClick={() => openClerkUserProfile()}
                  >
                    {t3({
                      en: "Manage account",
                      fr: "Gérer le compte",
                      pt: "Gerir a conta",
                    })}
                  </button>
                </div>
              </div>

              {/* Organisation */}
              <Card
                header={t3({
                  en: "Organisation",
                  fr: "Organisation",
                  pt: "Organização",
                })}
              >
                <div class="ui-spy-sm">
                  <Show
                    when={editingOrganisation()}
                    fallback={
                      <div class="flex items-center gap-2">
                        <span class="text-base-content-muted flex-1 text-sm">
                          {organisation() || (
                            <span class="text-base-content-muted">
                              {t3({
                                en: "Not set",
                                fr: "Non défini",
                                pt: "Não definido",
                              })}
                            </span>
                          )}
                        </span>
                        <Button
                          onClick={() => setEditingOrganisation(true)}
                          outline
                          size="sm"
                          iconName="pencil"
                        >
                          {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
                        </Button>
                      </div>
                    }
                  >
                    <div class="flex items-center gap-2">
                      <TextArea
                        value={organisation()}
                        onChange={setOrganisation}
                        placeholder={t3({
                          en: "Organisation name",
                          fr: "Nom de l'organisation",
                          pt: "Nome da organização",
                        })}
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
                      <Button
                        onClick={() => setEditingOrganisation(false)}
                        intent="neutral"
                        outline
                      >
                        {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                      </Button>
                    </div>
                  </Show>
                </div>
              </Card>

              {/* Email address */}
              <Card
                header={t3({
                  en: "Email address",
                  fr: "Adresse e-mail",
                  pt: "Endereço de e-mail",
                })}
              >
                <div class="ui-spy-sm">
                  <div class="flex items-center gap-2">
                    <span class="text-base-content-muted flex-1 text-sm">
                      {keyedUser.email}
                    </span>
                    <Button
                      onClick={() =>
                        openComponent({
                          element: ChangeEmailModal,
                          props: { currentEmail: keyedUser.email },
                        })
                      }
                      outline
                      size="sm"
                      iconName="pencil"
                    >
                      {t3({
                        en: "Change email",
                        fr: "Changer d'e-mail",
                        pt: "Alterar e-mail",
                      })}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Appearance */}
              <Card
                header={t3({
                  en: "Appearance",
                  fr: "Apparence",
                  pt: "Aparência",
                })}
              >
                <div class="ui-spy-sm">
                  <ButtonGroup
                    items={[
                      {
                        id: "system" as const,
                        label: t3({
                          en: "System",
                          fr: "Système",
                          pt: "Sistema",
                        }),
                      },
                      {
                        id: "light" as const,
                        label: t3({ en: "Light", fr: "Clair", pt: "Claro" }),
                      },
                      {
                        id: "dark" as const,
                        label: t3({ en: "Dark", fr: "Sombre", pt: "Escuro" }),
                      },
                    ]}
                    value={schemePref()}
                    onChange={(v) => v && setScheme(v)}
                  />
                </div>
              </Card>

              {/* AI usage */}
              <Card
                header={t3({
                  en: "AI usage today",
                  fr: "Utilisation IA aujourd'hui",
                  pt: "Utilização de IA hoje",
                })}
              >
                <div class="ui-spy-sm">
                  <StateHolderWrapper state={aiUsage.state()} noPad>
                    {(usage) => {
                      const pct =
                        !usage.isUnlimited && usage.dailyTokenLimit !== null
                          ? Math.min(
                              100,
                              Math.round(
                                (usage.tokensUsedToday /
                                  usage.dailyTokenLimit) *
                                  100,
                              ),
                            )
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
                            {usage.isUnlimited ? (
                              t3({
                                en: "Unlimited",
                                fr: "Illimité",
                                pt: "Ilimitado",
                              })
                            ) : (
                              <>
                                {usage.tokensUsedToday.toLocaleString()}{" "}
                                {usage.dailyTokenLimit !== null
                                  ? `/ ${usage.dailyTokenLimit.toLocaleString()} ${t3({ en: "tokens", fr: "tokens", pt: "tokens" })} (${pct}%)`
                                  : t3({
                                      en: "tokens used today · Unlimited",
                                      fr: "tokens utilisés aujourd'hui · Illimité",
                                      pt: "tokens utilizados hoje · Ilimitado",
                                    })}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  </StateHolderWrapper>
                </div>
              </Card>

              {/* AI usage this week */}
              <Card
                header={t3({
                  en: "AI usage this week (country)",
                  fr: "Utilisation IA cette semaine (pays)",
                  pt: "Utilização de IA esta semana (país)",
                })}
              >
                <div class="ui-spy-sm">
                  <StateHolderWrapper state={aiUsage.state()} noPad>
                    {(usage) => {
                      const pct =
                        usage.weeklyTokenLimit !== null
                          ? Math.min(
                              100,
                              Math.round(
                                (usage.tokensUsedThisWeek /
                                  usage.weeklyTokenLimit) *
                                  100,
                              ),
                            )
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
                              : t3({
                                  en: "tokens used this week · Unlimited",
                                  fr: "tokens utilisés cette semaine · Illimité",
                                  pt: "tokens utilizados esta semana · Ilimitado",
                                })}
                          </div>
                        </div>
                      );
                    }}
                  </StateHolderWrapper>
                </div>
              </Card>

              {/* Mailing list */}
              <Card
                header={t3({
                  en: "Mailing list",
                  fr: "Liste de diffusion",
                  pt: "Lista de distribuição",
                })}
              >
                <div class="ui-spy-sm">
                  <Checkbox
                    checked={optedIn()}
                    onChange={toggleOptIn}
                    label={t3({
                      en: "Receive email updates and announcements",
                      fr: "Recevoir des mises à jour et annonces par email",
                      pt: "Receber atualizações e anúncios por email",
                    })}
                  />
                </div>
              </Card>

              {/* Cache management */}
              <Card
                header={t3({
                  en: "Cache management",
                  fr: "Gestion du cache",
                  pt: "Gestão da cache",
                })}
                headerRight={
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
                <div class="ui-spy-sm">{null}</div>
              </Card>
            </>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
