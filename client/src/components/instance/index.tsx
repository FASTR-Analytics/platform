import { useSearchParams } from "@solidjs/router";
import { TC, compareDottedVersions, getLanguage, t3, LANGUAGE_STORAGE_KEY } from "lib";
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
  type ListItem,
  type MenuItem,
} from "panther";
import { Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { EmailOptInModal } from "~/components/email_opt_in_modal";
import { OrganisationModal } from "~/components/organisation_modal";
import { WhatsNewModal } from "~/components/whats_new_modal";
import { serverActions } from "~/server_actions";
import { InstanceAssets } from "~/components/instance/instance_assets";
import { InstanceData } from "~/components/instance/instance_data";
import { InstanceProjects } from "~/components/instance/instance_projects";
import { InstanceUsers } from "~/components/instance/instance_users";
import { instanceState } from "~/state/instance/t1_store";
import Project from "../project";
import { FeedbackForm } from "./feedback_form";
import { InstanceMetaForm } from "./instance_meta_form";
import { InstanceSettings } from "./instance_settings";
import { ProfileForm } from "./profile";

type InstanceTab = "projects" | "data" | "assets" | "users" | "settings";

function compactNavItems(): ListItem<InstanceTab>[] {
  const items: ListItem<InstanceTab>[] = [
    {
      id: "projects",
      label: "",
      labelText: t3({ en: "Projects", fr: "Projets", pt: "Projetos" }),
      iconName: "folder",
    },
    {
      id: "data",
      label: "",
      labelText: t3({ en: "Data", fr: "Données", pt: "Dados" }),
      iconName: "database",
    },
    {
      id: "assets",
      label: "",
      labelText: t3({ en: "Assets", fr: "Ressources", pt: "Recursos" }),
      iconName: "package",
    },
  ];
  if (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_users ||
    instanceState.currentUserPermissions.can_view_users
  ) {
    items.push({
      id: "users",
      label: "",
      labelText: t3({ en: "Users", fr: "Utilisateurs", pt: "Utilizadores" }),
      iconName: "users",
    });
  }
  if (instanceState.currentUserIsGlobalAdmin) {
    items.push({
      id: "settings",
      label: "",
      labelText: t3(TC.settings),
      iconName: "settings",
    });
  }
  return items;
}

function wideNavItems(): ListItem<InstanceTab>[] {
  const items: ListItem<InstanceTab>[] = [
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
  if (
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_settings
  ) {
    items.push({
      id: "settings",
      label: t3(TC.settings),
      iconName: "settings",
    });
  }
  return items;
}

type Props = {
  attemptSignOut: () => Promise<void>;
};

export default function Instance(p: Props) {
  const [searchParams] = useSearchParams();
  const [_tab, setTab] = createSignal<
    "projects" | "users" | "data" | "assets" | "settings"
  >("projects");

  const p_ = () => instanceState.currentUserPermissions;
  const a_ = () => instanceState.currentUserIsGlobalAdmin;
  const tab = (): "projects" | "users" | "data" | "assets" | "settings" => {
    const t = _tab();
    const admin = a_();
    const perms = p_();
    const canData = admin || perms.can_view_data || perms.can_configure_data;
    const canUsers = admin || perms.can_configure_users || perms.can_view_users;
    const canSettings = admin || perms.can_configure_settings;
    if (t === "data" && !canData) return "projects";
    if (t === "users" && !canUsers) return "projects";
    if (t === "settings" && !canSettings) return "projects";
    return t;
  };

  // post-login modals — wait until user is approved; skip inside a project
  createEffect(() => {
    if (getFirstString(searchParams.p)) return;
    if (!instanceState.currentUserApproved) return;
    if (!clerk.user) return;
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
          {(projectId) => (
            <Project
              projectId={projectId}
            />
          )}
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
                      {({ en: "EN", fr: "FR", pt: "PT" } as const)[getLanguage()]}
                    </Button>
                  </MenuTriggerWrapper>
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
                  <InstanceData
                  />
                </Match>
                <Match when={tab() === "assets"}>
                  <InstanceAssets
                  />
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
                <Match
                  when={
                    (instanceState.currentUserIsGlobalAdmin ||
                      instanceState.currentUserPermissions
                        .can_configure_settings) &&
                    tab() === "settings"
                  }
                >
                  <InstanceSettings
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

// Show the What's New popup once per user per release. The server returns only
// published posts eligible for this instance (version <= server version,
// adminsOnly pre-filtered). Seen-state is a high-water-mark version string in
// Clerk unsafeMetadata; brand-new users are baselined without seeing a popup.
async function maybeShowWhatsNew(isBrandNewUser: boolean) {
  const res = await serverActions.getWhatsNewPosts({});
  if (!res.success || res.data.length === 0) {
    return;
  }
  const newest = res.data.reduce((a, b) =>
    compareDottedVersions(a.version, b.version) >= 0 ? a : b,
  );
  const seen = clerk.user?.unsafeMetadata?.whatsNewSeenVersion as
    | string
    | undefined;
  if (seen && compareDottedVersions(newest.version, seen) <= 0) {
    return;
  }
  if (!isBrandNewUser && newest.pages.length > 0) {
    await openComponent({ element: WhatsNewModal, props: { post: newest } });
  }
  try {
    await clerk.user?.update({
      unsafeMetadata: {
        ...clerk.user.unsafeMetadata,
        whatsNewSeenVersion: newest.version,
      },
    });
  } catch (err) {
    console.error("Failed to record whatsNewSeenVersion", err);
  }
}
