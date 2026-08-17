import { useSearchParams } from "@solidjs/router";
import {
  TC,
  compareDottedVersions,
  getLanguage,
  migrateSeenVersionToReadIds,
  parseWhatsNewReadIds,
  pruneWhatsNewReadIds,
  t3,
  whatsNewAutoShowPost,
  LANGUAGE_STORAGE_KEY,
} from "lib";
import type { WhatsNewPost } from "lib";
import {
  AlertProvider,
  Button,
  ButtonGroup,
  FrameTop,
  Icon,
  MenuTriggerWrapper,
  PopoverMenuProvider,
  TooltipProvider,
  getFirstString,
  openComponent,
  type IconName,
  type ListItem,
  type MenuItem,
} from "panther";
import { Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { EmailOptInModal } from "~/components/email_opt_in_modal";
import { OrganisationModal } from "~/components/organisation_modal";
import { WhatsNewFeedModal, WhatsNewModal } from "~/components/whats_new_modal";
import { serverActions } from "~/server_actions";
import { InstanceAssets } from "~/components/instance/instance_assets";
import { InstanceData } from "~/components/instance/instance_data";
import { InstanceProjects } from "~/components/instance/instance_projects";
import { InstanceResultsPackages } from "~/components/instance_results_packages";
import { InstanceUsers } from "~/components/instance/instance_users";
import { instanceState } from "~/state/instance/t1_store";
import Project from "../project";
import { FeedbackForm } from "./feedback_form";
import { InstanceMetaForm } from "./instance_meta_form";
import { ProfileForm } from "./profile";

type InstanceTab =
  | "projects"
  | "data"
  | "results_packages"
  | "assets"
  | "users";

// Generation is instance-admin only (can_configure_data — the same guard the
// run_generation routes use).
function canConfigureData(): boolean {
  return (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data
  );
}

// One gated, ordered list; the compact (icon-only) nav is a projection of it
// so order and permission gates cannot drift between the two widths.
function wideNavItems(): { id: InstanceTab; label: string; iconName: IconName }[] {
  const items: { id: InstanceTab; label: string; iconName: IconName }[] = [
    {
      id: "projects",
      label: t3({ en: "Projects", fr: "Projets", pt: "Projetos" }),
      iconName: "folder",
    },
  ];
  if (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_view_data ||
    instanceState.currentUserPermissions.can_configure_data
  ) {
    items.push({
      id: "data",
      label: t3({ en: "Data", fr: "Données", pt: "Dados" }),
      iconName: "database",
    });
  }
  if (canConfigureData()) {
    items.push({
      id: "results_packages",
      label: t3({
        en: "Results",
        fr: "Résultats",
        pt: "Resultados",
      }),
      iconName: "chart",
    });
  }
  items.push({
    id: "assets",
    label: t3({ en: "Assets", fr: "Ressources", pt: "Recursos" }),
    iconName: "package",
  });
  if (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_users ||
    instanceState.currentUserPermissions.can_view_users
  ) {
    items.push({
      id: "users",
      label: t3({ en: "Users", fr: "Utilisateurs", pt: "Utilizadores" }),
      iconName: "users",
    });
  }
  return items;
}

function compactNavItems(): ListItem<InstanceTab>[] {
  return wideNavItems().map((item) => ({
    id: item.id,
    label: "",
    labelText: item.label,
    iconName: item.iconName,
  }));
}

type Props = {
  attemptSignOut: () => Promise<void>;
};

export default function Instance(p: Props) {
  const [searchParams] = useSearchParams();
  const [_tab, setTab] = createSignal<InstanceTab>("projects");

  const p_ = () => instanceState.currentUserPermissions;
  const a_ = () => instanceState.currentUserIsGlobalAdmin;
  const tab = (): InstanceTab => {
    const t = _tab();
    const admin = a_();
    const perms = p_();
    const canData = admin || perms.can_view_data || perms.can_configure_data;
    const canUsers = admin || perms.can_configure_users || perms.can_view_users;
    if (t === "data" && !canData) return "projects";
    if (t === "results_packages" && !canConfigureData()) return "projects";
    if (t === "users" && !canUsers) return "projects";
    return t;
  };

  // post-login modals — wait until user is approved; skip inside a project.
  // Runs ONCE per signed-in user: the effect's reactive deps (searchParams,
  // approval store) re-fire it on every return from a project, which would
  // otherwise re-open the modals and displace whatever the alert slot holds.
  createEffect(() => {
    if (getFirstString(searchParams.p)) return;
    if (!instanceState.currentUserApproved) return;
    if (!clerk.user) return;
    if (postLoginRanForUserId === clerk.user.id) return;
    postLoginRanForUserId = clerk.user.id;
    (async () => {
      const isBrandNewUser = !clerk.user!.unsafeMetadata?.emailOptInAsked;
      if (isBrandNewUser) {
        await openComponent({ element: EmailOptInModal, props: undefined });
      }
      if (!clerk.user!.unsafeMetadata?.organisation) {
        await openComponent({ element: OrganisationModal, props: undefined });
      }
      await maybeShowWhatsNew(isBrandNewUser);
    })();
  });

  async function openProfile() {
    await openComponent({
      element: ProfileForm,
      props: { attemptSignOut: p.attemptSignOut },
    });
  }

  async function openInstanceMeta() {
    await openComponent({
      element: InstanceMetaForm,
      props: {},
    });
  }

  async function openFeedback() {
    await openComponent({
      element: FeedbackForm,
      props: {},
    });
  }

  return (
    <>
      <Switch>
        <Match when={getFirstString(searchParams.p)} keyed>
          {(projectId) => <Project projectId={projectId} />}
        </Match>
        <Match when={true}>
          <FrameTop
            panelChildren={
              <div class="ui-pad ui-gap bg-base-100 text-base-content flex items-center">
                <div class="flex flex-0 items-center">
                  <div class="font-700 border-r pr-4 text-2xl text-nowrap antialiased">
                    {instanceState.instanceName}
                  </div>
                  <div class="w-24 flex-none pl-4">
                    <img
                      src="/images/logo.png"
                      class="h-4 w-24 object-contain"
                    />
                  </div>
                </div>
                <Show when={instanceState.currentUserApproved}>
                  <div class="flex flex-1 justify-center xl:hidden">
                    <ButtonGroup
                      value={tab()}
                      onChange={setTab}
                      items={compactNavItems()}
                      itemWidth="50px"
                    />
                  </div>
                  <div class="hidden flex-1 justify-center xl:flex">
                    <ButtonGroup
                      value={tab()}
                      onChange={setTab}
                      items={wideNavItems()}
                      itemWidth={getLanguage() === "en" ? "115px" : "140px"}
                    />
                  </div>
                </Show>
                <div class="ui-gap-sm flex flex-0 items-center justify-end">
                  <MenuTriggerWrapper
                    items={
                      [
                        {
                          label: "English",
                          onClick: () => {
                            localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
                            if (getLanguage() === "en") return;
                            window.location.reload();
                          },
                        },
                        {
                          label: "Français",
                          onClick: () => {
                            localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
                            if (getLanguage() === "fr") return;
                            window.location.reload();
                          },
                        },
                        {
                          label: "Português",
                          onClick: () => {
                            localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt");
                            if (getLanguage() === "pt") return;
                            window.location.reload();
                          },
                        },
                      ] satisfies MenuItem[]
                    }
                    position="bottom-end"
                  >
                    <Button intent="base-100">
                      {
                        ({ en: "EN", fr: "FR", pt: "PT" } as const)[
                          getLanguage()
                        ]
                      }
                    </Button>
                  </MenuTriggerWrapper>
                  <Show
                    when={
                      instanceState.currentUserApproved &&
                      whatsNewPostsForCurrentUser().length > 0
                    }
                  >
                    <div class="relative">
                      <Button
                        onClick={openWhatsNewFeed}
                        iconName="bell"
                        intent="base-100"
                      />
                      <Show when={whatsNewHasUnread()}>
                        <div class="bg-warning pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full" />
                      </Show>
                    </div>
                  </Show>
                  <Show when={instanceState.currentUserApproved}>
                    <Button
                      onClick={openFeedback}
                      iconName="help"
                      intent="base-100"
                    />
                    <Button
                      onClick={openInstanceMeta}
                      iconName="versions"
                      intent="base-100"
                    />
                  </Show>
                  <div
                    class="ui-hoverable-base-100 ui-gap-sm ui-pad-sm flex items-center rounded"
                    onClick={openProfile}
                  >
                    <span class="text-primary inline-block w-5">
                      <Icon iconName="userCircle" />
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <Show
              when={instanceState.currentUserApproved}
              fallback={
                <div class="ui-pad">
                  {t3({
                    en: "You are not yet approved. Wait for an administrator to add you to the platform.",
                    fr: "Vous n'êtes pas encore approuvé. Veuillez attendre qu'un administrateur vous ajoute à la plateforme.",
                    pt: "Ainda não foi aprovado. Aguarde que um administrador o adicione à plataforma.",
                  })}
                </div>
              }
            >
              <Switch>
                <Match
                  when={
                    tab() === "data" &&
                    (instanceState.currentUserIsGlobalAdmin ||
                      instanceState.currentUserPermissions.can_view_data ||
                      instanceState.currentUserPermissions.can_configure_data)
                  }
                >
                  <InstanceData />
                </Match>
                <Match
                  when={tab() === "results_packages" && canConfigureData()}
                >
                  <InstanceResultsPackages />
                </Match>
                <Match when={tab() === "assets"}>
                  <InstanceAssets />
                </Match>
                <Match
                  when={
                    (instanceState.currentUserIsGlobalAdmin ||
                      instanceState.currentUserPermissions
                        .can_configure_users ||
                      instanceState.currentUserPermissions.can_view_users) &&
                    tab() === "users"
                  }
                >
                  <InstanceUsers
                    thisLoggedInUserEmail={instanceState.currentUserEmail}
                  />
                </Match>
                <Match when={true}>
                  <InstanceProjects
                    canCreateProjects={
                      instanceState.currentUserPermissions.can_create_projects
                    }
                  />
                </Match>
              </Switch>
            </Show>
          </FrameTop>
        </Match>
      </Switch>
      <AlertProvider />
      <PopoverMenuProvider />
      <TooltipProvider />
    </>
  );
}

// What's New: the server returns only published posts eligible for this
// instance (version <= server version, adminsOnly pre-filtered). Seen-state is
// a high-water-mark version string in Clerk unsafeMetadata; brand-new users
// are baselined without seeing a popup. Fetched posts also power the header
// bell (unread dot + browsable feed). All module-level state is scoped to the
// signed-in user's id — these signals outlive a same-tab user switch that
// happens without a full page reload.
const [whatsNewState, setWhatsNewState] = createSignal<{
  userId: string;
  posts: WhatsNewPost[];
} | null>(null);
const [whatsNewReadIds, setWhatsNewReadIds] = createSignal<Set<string>>(
  new Set(),
);
let postLoginRanForUserId: string | null = null;

function whatsNewPostsForCurrentUser(): WhatsNewPost[] {
  const state = whatsNewState();
  return state && state.userId === clerk.user?.id ? state.posts : [];
}

function newestWhatsNewPost(posts: WhatsNewPost[]): WhatsNewPost {
  return posts.reduce((a, b) =>
    compareDottedVersions(a.version, b.version) >= 0 ? a : b,
  );
}

// Read-ids from Clerk metadata, migrating users who still carry the old
// high-water `whatsNewSeenVersion`. needsWrite flags that migration so the
// caller persists the converted set once.
function readIdsFromMetadata(posts: WhatsNewPost[]): {
  ids: Set<string>;
  needsWrite: boolean;
} {
  const stored = parseWhatsNewReadIds(
    clerk.user?.unsafeMetadata?.whatsNewReadPostIds,
  );
  if (stored) {
    return { ids: new Set(stored), needsWrite: false };
  }
  const legacy = clerk.user?.unsafeMetadata?.whatsNewSeenVersion;
  if (typeof legacy === "string") {
    return {
      ids: new Set(migrateSeenVersionToReadIds(posts, legacy)),
      needsWrite: true,
    };
  }
  return { ids: new Set(), needsWrite: false };
}

function whatsNewHasUnread(): boolean {
  const ids = whatsNewReadIds();
  return whatsNewPostsForCurrentUser().some((p) => !ids.has(p.id));
}

function recordWhatsNewEvent(
  postId: string,
  event: "seen" | "skipped" | "completed",
) {
  serverActions.recordWhatsNewEvent({ postId, event }).catch(() => {});
}

async function persistWhatsNewReadIds(ids: Set<string>, posts: WhatsNewPost[]) {
  const pruned = pruneWhatsNewReadIds(ids, posts);
  try {
    await clerk.user?.update({
      unsafeMetadata: {
        ...clerk.user.unsafeMetadata,
        whatsNewReadPostIds: pruned,
      },
    });
    // Only on success — a failed write leaves the unread dot lit
    setWhatsNewReadIds(new Set(pruned));
  } catch (err) {
    console.error("Failed to record whatsNewReadPostIds", err);
  }
}

async function markWhatsNewRead(postId: string) {
  const posts = whatsNewPostsForCurrentUser();
  await persistWhatsNewReadIds(new Set([...whatsNewReadIds(), postId]), posts);
}

async function maybeShowWhatsNew(isBrandNewUser: boolean) {
  const userId = clerk.user?.id;
  if (!userId) {
    return;
  }
  const res = await serverActions.getWhatsNewPosts({});
  if (!res.success || res.data.length === 0) {
    return;
  }
  const posts = res.data;
  setWhatsNewState({ userId, posts });

  const { ids, needsWrite } = readIdsFromMetadata(posts);
  setWhatsNewReadIds(ids);

  // A brand-new user starts current: everything is marked read, so they get
  // neither a popup nor a dot for releases that predate their account
  if (isBrandNewUser) {
    await persistWhatsNewReadIds(new Set(posts.map((p) => p.id)), posts);
    return;
  }
  if (needsWrite) {
    await persistWhatsNewReadIds(ids, posts);
  }

  // Only a release newer than anything already acknowledged is pushed at
  // login; older unread posts stay behind the bell's dot rather than
  // resurfacing one at a time on subsequent logins
  const toShow = whatsNewAutoShowPost(posts, ids);
  if (!toShow) {
    return;
  }
  if ((toShow.pages?.length ?? 0) > 0) {
    recordWhatsNewEvent(toShow.id, "seen");
    const outcome = await openComponent({
      element: WhatsNewModal,
      props: { post: toShow },
    });
    recordWhatsNewEvent(toShow.id, outcome ?? "skipped");
  }
  await markWhatsNewRead(toShow.id);
}

// Header-bell feed: browse every post; each one opened is marked read
// individually, so the dot survives until nothing is left unread.
async function openWhatsNewFeed() {
  const posts = whatsNewPostsForCurrentUser();
  if (posts.length === 0) {
    return;
  }
  while (true) {
    const chosen = await openComponent({
      element: WhatsNewFeedModal,
      props: { posts, readIds: whatsNewReadIds() },
    });
    if (!chosen) {
      return;
    }
    recordWhatsNewEvent(chosen.id, "seen");
    const outcome = await openComponent({
      element: WhatsNewModal,
      props: { post: chosen },
    });
    recordWhatsNewEvent(chosen.id, outcome ?? "skipped");
    await markWhatsNewRead(chosen.id);
  }
}
