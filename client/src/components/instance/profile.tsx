import { clearAiChatCache, clearDataCache } from "~/state/clear_caches";
import { darkMode, schemePref, setScheme } from "~/state/t4_ui";
import { clerk } from "~/state/_infra/clerk";
import { t3, TC } from "lib";
import {
  type AlertComponentProps,
  Button,
  ButtonGroup,
  Card,
  createButtonAction,
  createQuery,
  Input,
  KEY_COLOR_THEMES,
  ModalContainer,
  openComponent,
} from "panther";
import { ChangeEmailModal } from "./change_email_modal";
import { clerkActive } from "~/state/_infra/auth_mode";
import { confirmReloadUnderTurn } from "./copilot/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { createSignal, type JSX, onCleanup, Show } from "solid-js";

// The one panther dark palette: same source as the CSS pairs and the canvas
// dark companion.
const DARK_THEME_COLORS = KEY_COLOR_THEMES["panther-default-dark"].colors;

// Clerk's account window renders in its own portal with Clerk's own styling,
// so the app's CSS tokens don't reach it. Pass dark appearance variables at
// open time: evaluated per open, so it follows the scheme active when the
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

// What one row of the usage section shows. undefined while it loads: the
// row keeps its final size, so the modal never grows when the numbers land.
type UsageFigures = { used: number; limit: number | null };

function UsageMeter(p: {
  label: string;
  figures: UsageFigures | undefined;
  unlimitedText: string;
  // Who the figure counts, when that is not simply "you". The two meters count
  // different populations under different conditions, so a row that leaves
  // this user's own use out has to say so: otherwise one user's day reading
  // larger than the whole country's week looks impossible.
  note?: string;
}) {
  const pct = () => {
    const f = p.figures;
    if (f === undefined || f.limit === null || f.limit <= 0) return null;
    return Math.min(100, Math.round((f.used / f.limit) * 100));
  };
  return (
    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="text-base-content text-sm">{p.label}</div>
      <div class="bg-base-200 h-2 w-full overflow-hidden rounded-full">
        <Show when={pct()} keyed>
          {(v) => (
            <div
              class="h-full rounded-full transition-all"
              classList={{ "bg-warning": v >= 80, "bg-primary": v < 80 }}
              style={{ width: `${v}%` }}
            />
          )}
        </Show>
      </div>
      <div class="text-base-content-muted flex h-5 items-center text-sm">
        <Show
          when={p.figures}
          keyed
          fallback={
            <div class="bg-base-200 h-3 w-32 rounded motion-safe:animate-pulse" />
          }
        >
          {(f) =>
            f.limit === null
              ? `${f.used.toLocaleString()} · ${p.unlimitedText}`
              : `${f.used.toLocaleString()} / ${f.limit.toLocaleString()} ${
                t3({ en: "tokens", fr: "tokens", pt: "tokens" })
              } (${pct()}%)`}
        </Show>
      </div>
      <Show when={p.note} keyed>
        {(note) => <div class="text-base-content-muted text-xs">{note}</div>}
      </Show>
    </div>
  );
}

// A labelled line of a section: the label on the left, its value or control
// on the right, wrapping under it on a narrow modal.
function SettingRow(p: { label: string; children: JSX.Element }) {
  return (
    <div class="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 py-2">
      <div class="text-base-content w-32 flex-none text-sm">{p.label}</div>
      <div class="flex min-w-0 flex-1 items-center justify-end gap-2">
        {p.children}
      </div>
    </div>
  );
}

function SettingSection(p: { label: string; children: JSX.Element }) {
  return (
    <section>
      <div class="ui-text-overline text-base-content-muted pb-1">
        {p.label}
      </div>
      <div class="divide-y">{p.children}</div>
    </section>
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

  // A name edited in Clerk's account window reaches the users table through
  // getCurrentUser's sync (contract on syncUserName), which would otherwise
  // wait for the next page load. The listener fires on every Clerk resource
  // change, so act only when the name itself differs. skipCache mints a
  // session token carrying the new name claims before the refetch reads them.
  let syncedName = `${clerk.user?.firstName ?? ""}\n${
    clerk.user?.lastName ?? ""
  }`;
  const unsubscribeClerk = clerk.addListener((e) => {
    if (!e.user) return;
    const name = `${e.user.firstName ?? ""}\n${e.user.lastName ?? ""}`;
    if (name === syncedName) return;
    syncedName = name;
    (async () => {
      await clerk.session?.getToken({ skipCache: true });
      await userDetails.silentFetch();
    })().catch(() => {});
  });
  onCleanup(unsubscribeClerk);

  // Each of these reloads the page, which loses an AI turn in flight, so each
  // asks first while one runs (S13's turn guard).
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

  async function afterTurnGuard(action: () => Promise<unknown>): Promise<void> {
    if (await confirmReloadUnderTurn()) await action();
  }

  // The name and email show at once from the Clerk session and are replaced
  // by the users table's copy when it arrives (the same values in practice),
  // so nothing in the modal waits on the fetch.
  const user = () => {
    const st = userDetails.state();
    return st.status === "ready" ? st.data : undefined;
  };
  const fullName = () => {
    const u = user();
    const parts = u
      ? [u.firstName, u.lastName]
      : [clerk.user?.firstName, clerk.user?.lastName];
    return parts.filter(Boolean).join(" ") || "—";
  };
  const email = () =>
    user()?.email ?? clerk.user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = () =>
    fullName()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

  // The organisation is the user's own words in the users table
  // (updateMyProfile), edited in place.
  const [editingOrganisation, setEditingOrganisation] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const startEdit = () => {
    setDraft(user()?.organisation ?? "");
    setEditingOrganisation(true);
  };
  const saveOrganisation = createButtonAction(
    () => serverActions.updateMyProfile({ organisation: draft() }),
    async () => {
      setEditingOrganisation(false);
      await userDetails.silentFetch();
    },
  );

  const manageAccountLabel = t3({
    en: "Manage account",
    fr: "Gérer le compte",
    pt: "Gerir a conta",
  });

  return (
    <ModalContainer
      title={t3({ en: "Your profile", fr: "Votre profil", pt: "O seu perfil" })}
      width="lg"
      spy="lg"
      actions={[
        {
          label: t3({
            en: "Sign out",
            fr: "Se déconnecter",
            pt: "Terminar sessão",
          }),
          onClick: () => afterTurnGuard(p.attemptSignOut),
          outline: true,
          iconName: "arrowLeft",
        },
        {
          label: t3(TC.done),
          onClick: () => p.close(undefined),
        },
      ]}
    >
      {/* Who: the avatar slot is always there, initials until a photo. */}
      <div class="flex items-center gap-4">
        <button
          type="button"
          class={`bg-base-200 text-base-content-muted font-700 flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition ${
            clerkActive ? "hover:ring-primary cursor-pointer" : ""
          }`}
          disabled={!clerkActive}
          onClick={() => openClerkUserProfile()}
          title={clerkActive ? manageAccountLabel : undefined}
        >
          <Show when={clerk.user?.imageUrl} keyed fallback={initials()}>
            {(src) => <img src={src} alt={fullName()} class="h-full w-full" />}
          </Show>
        </button>
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="font-700 text-base-content truncate text-base">
            {fullName()}
          </div>
          <div class="text-base-content-muted truncate text-sm">{email()}</div>
          <Show when={clerkActive}>
            <button
              type="button"
              class="text-primary w-fit cursor-pointer text-xs hover:underline"
              onClick={() => openClerkUserProfile()}
            >
              {manageAccountLabel}
            </button>
          </Show>
        </div>
      </div>

      <SettingSection label={t3({ en: "Account", fr: "Compte", pt: "Conta" })}>
        <SettingRow
          label={t3({
            en: "Organisation",
            fr: "Organisation",
            pt: "Organização",
          })}
        >
          <Show
            when={editingOrganisation()}
            fallback={
              <>
                <span class="text-base-content-muted min-w-0 flex-1 truncate text-right text-sm">
                  {user()?.organisation ||
                    t3({ en: "Not set", fr: "Non défini", pt: "Não definido" })}
                </span>
                <Button onClick={startEdit} outline size="sm" iconName="pencil">
                  {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
                </Button>
              </>
            }
          >
            <Input
              value={draft()}
              onChange={setDraft}
              placeholder={t3({
                en: "Organisation name",
                fr: "Nom de l'organisation",
                pt: "Nome da organização",
              })}
              fullWidth
              size="sm"
              autoFocus
            />
            <Button
              onClick={saveOrganisation.click}
              state={saveOrganisation.state()}
              intent="primary"
              outline
              size="sm"
            >
              {t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })}
            </Button>
            <Button
              onClick={() => setEditingOrganisation(false)}
              intent="neutral"
              outline
              size="sm"
            >
              {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          </Show>
        </SettingRow>
        <SettingRow
          label={t3({ en: "Email", fr: "E-mail", pt: "E-mail" })}
        >
          <span class="text-base-content-muted min-w-0 flex-1 truncate text-right text-sm">
            {email()}
          </span>
          <Show when={clerkActive}>
            <Button
              onClick={() =>
                afterTurnGuard(() =>
                  openComponent({
                    element: ChangeEmailModal,
                    props: { currentEmail: email() },
                  })
                )}
              disabled={user() === undefined}
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
          </Show>
        </SettingRow>
      </SettingSection>

      <SettingSection
        label={t3({ en: "Preferences", fr: "Préférences", pt: "Preferências" })}
      >
        <SettingRow
          label={t3({ en: "Appearance", fr: "Apparence", pt: "Aparência" })}
        >
          <ButtonGroup
            items={[
              {
                id: "system" as const,
                label: t3({ en: "System", fr: "Système", pt: "Sistema" }),
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
        </SettingRow>
      </SettingSection>

      {/* The profile opens before approval; usage is an approved user's. */}
      <Show when={instanceState.currentUserApproved}>
        <AiUsageSection />
      </Show>

      <SettingSection
        label={t3({
          en: "Troubleshooting",
          fr: "Dépannage",
          pt: "Resolução de problemas",
        })}
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
          <div class="text-base-content-muted min-w-0 flex-1 text-sm">
            {t3({
              en:
                "If something looks out of date or the AI is stuck, clearing these reloads the page.",
              fr:
                "Si quelque chose semble périmé ou si l'IA est bloquée, vider ces données recharge la page.",
              pt:
                "Se algo parecer desatualizado ou a IA estiver bloqueada, limpar estes dados recarrega a página.",
            })}
          </div>
          <div class="ui-gap-sm flex flex-none">
            <Button
              onClick={() => afterTurnGuard(clearCache.click)}
              state={clearCache.state()}
              outline
              size="sm"
              iconName="trash"
            >
              {t3({
                en: "Clear data cache",
                fr: "Vider le cache de données",
                pt: "Limpar a cache de dados",
              })}
            </Button>
            <Button
              onClick={() => afterTurnGuard(clearAiChat.click)}
              state={clearAiChat.state()}
              outline
              size="sm"
              iconName="trash"
            >
              {t3({
                en: "Clear AI chat history",
                fr: "Vider l'historique IA",
                pt: "Limpar o histórico de conversas de IA",
              })}
            </Button>
          </div>
        </div>
      </SettingSection>
    </ModalContainer>
  );
}

// Owns its query, so it runs only when the section renders.
function AiUsageSection() {
  const aiUsage = createQuery(
    () => serverActions.getAiUsage({}),
    t3({
      en: "Loading AI usage...",
      fr: "Chargement de l'utilisation IA...",
      pt: "A carregar a utilização de IA...",
    }),
  );

  const usage = () => {
    const st = aiUsage.state();
    return st.status === "ready" ? st.data : undefined;
  };
  const todayFigures = (): UsageFigures | undefined => {
    const u = usage();
    return u && {
      used: u.tokensUsedToday,
      limit: u.isUnlimited ? null : u.dailyTokenLimit,
    };
  };
  const weekFigures = (): UsageFigures | undefined => {
    const u = usage();
    return u && { used: u.tokensUsedThisWeek, limit: u.weeklyTokenLimit };
  };
  const usageError = () => {
    const st = aiUsage.state();
    return st.status === "error" ? st.err : undefined;
  };

  return (
    <SettingSection
      label={t3({
        en: "AI usage",
        fr: "Utilisation de l'IA",
        pt: "Utilização de IA",
      })}
    >
      <div class="grid grid-cols-1 gap-x-6 gap-y-3 py-2 sm:grid-cols-2">
        <UsageMeter
          label={t3({
            en: "Today (you)",
            fr: "Aujourd'hui (vous)",
            pt: "Hoje (o seu uso)",
          })}
          figures={todayFigures()}
          unlimitedText={t3({
            en: "tokens today · Unlimited",
            fr: "tokens aujourd'hui · Illimité",
            pt: "tokens hoje · Ilimitado",
          })}
        />
        <UsageMeter
          label={t3({
            en: "This week (country quota)",
            fr: "Cette semaine (quota du pays)",
            pt: "Esta semana (quota do país)",
          })}
          figures={weekFigures()}
          unlimitedText={t3({
            en: "tokens this week · Unlimited",
            fr: "tokens cette semaine · Illimité",
            pt: "tokens esta semana · Ilimitado",
          })}
          // Only when there IS a country quota: with WEEKLY_TOKEN_LIMIT
          // unset nobody's use is counted, so saying this user's is not
          // would imply everyone else's is.
          note={usage()?.isUnlimited && weekFigures()?.limit !== null
            ? t3({
              en:
                "Your own use is not counted here: an unlimited account does not spend the country's quota.",
              fr:
                "Votre propre utilisation n'est pas comptée ici : un compte illimité n'entame pas le quota du pays.",
              pt:
                "A sua própria utilização não é contada aqui: uma conta ilimitada não consome a quota do país.",
            })
            : undefined}
        />
      </div>
      <Show when={usageError()} keyed>
        {(err) => <div class="text-danger py-1 text-sm">{err}</div>}
      </Show>
    </SettingSection>
  );
}
