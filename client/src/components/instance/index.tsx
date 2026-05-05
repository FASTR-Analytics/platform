import { useSearchParams } from "@solidjs/router";
import { TC, isFrench, t3, LANGUAGE_STORAGE_KEY, type GlobalUser } from "lib";
import {
  AlertProvider,
  Button,
  ButtonGroup,
  FrameTop,
  MenuTriggerWrapper,
  PopoverMenuProvider,
  UserCircleIcon,
  getFirstString,
  openComponent,
  type MenuItem,
} from "panther";
import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { EmailOptInModal } from "~/components/email_opt_in_modal";
import { OrganisationModal } from "~/components/organisation_modal";
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

type Props = {
  globalUser: GlobalUser;
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
    const canAssets = admin || perms.can_configure_assets;
    const canUsers = admin || perms.can_configure_users || perms.can_view_users;
    const canSettings = admin || perms.can_configure_settings;
    if (t === "data" && !canData) return "projects";
    if (t === "assets" && !canAssets) return "projects";
    if (t === "users" && !canUsers) return "projects";
    if (t === "settings" && !canSettings) return "projects";
    return t;
  };

  // post-login modals
  onMount(async () => {
    if (!clerk.user) return; // skips dev bypass mode naturally
    if (!clerk.user.unsafeMetadata?.emailOptInAsked) {
      await openComponent({
        element: EmailOptInModal,
        props: undefined,
      });
    }
    if (p.globalUser.organisation === null) {
      await openComponent({
        element: OrganisationModal,
        props: undefined,
      });
    }
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
        <Match when={getFirstString(searchParams.p)}>
          <Project
            projectId={getFirstString(searchParams.p)!}
            isGlobalAdmin={instanceState.currentUserIsGlobalAdmin}
            currentUserEmail={instanceState.currentUserEmail}
          />
        </Match>
        <Match when={true}>
          <FrameTop
            panelChildren={
              <div class="ui-pad ui-gap bg-base-100 text-base-content flex items-center">
                <div class="flex flex-0 items-center">
                  <div class="border-base-300 font-700 border-r pr-4 text-2xl text-nowrap antialiased">
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
                      options={[
                        {
                          value: "projects",
                          iconName: "folder",
                        },
                        {
                          value: "data",
                          iconName: "database",
                        },
                        {
                          value: "assets",
                          iconName: "package",
                        },
                        ...(instanceState.currentUserIsGlobalAdmin ||
                        instanceState.currentUserPermissions
                          .can_configure_users ||
                        instanceState.currentUserPermissions.can_view_users
                          ? [
                              {
                                value: "users",
                                iconName: "users",
                              },
                            ]
                          : ([] as any)),
                        ...(instanceState.currentUserIsGlobalAdmin
                          ? [
                              {
                                value: "settings",
                                iconName: "settings",
                              },
                            ]
                          : ([] as any)),
                      ]}
                      itemWidth="50px"
                    />
                  </div>
                  <div class="hidden flex-1 justify-center xl:flex">
                    <ButtonGroup
                      value={tab()}
                      onChange={setTab}
                      options={[
                        {
                          value: "projects",
                          label: t3({ en: "Projects", fr: "Projets" }),
                          iconName: "folder",
                        },
                        ...(instanceState.currentUserIsGlobalAdmin ||
                        instanceState.currentUserPermissions.can_view_data ||
                        instanceState.currentUserPermissions.can_configure_data
                          ? [
                              {
                                value: "data",
                                label: t3({ en: "Data", fr: "Données" }),
                                iconName: "database",
                              },
                            ]
                          : ([] as any)),
                        ...(instanceState.currentUserIsGlobalAdmin ||
                        instanceState.currentUserPermissions
                          .can_configure_assets
                          ? [
                              {
                                value: "assets",
                                label: t3({ en: "Assets", fr: "Ressources" }),
                                iconName: "package",
                              },
                            ]
                          : ([] as any)),
                        ...(instanceState.currentUserIsGlobalAdmin ||
                        instanceState.currentUserPermissions
                          .can_configure_users ||
                        instanceState.currentUserPermissions.can_view_users
                          ? [
                              {
                                value: "users",
                                label: t3({ en: "Users", fr: "Utilisateurs" }),
                                iconName: "users",
                              },
                            ]
                          : ([] as any)),
                        ...(instanceState.currentUserIsGlobalAdmin ||
                        instanceState.currentUserPermissions
                          .can_configure_settings
                          ? [
                              {
                                value: "settings",
                                label: t3(TC.settings),
                                iconName: "settings",
                              },
                            ]
                          : ([] as any)),
                      ]}
                      itemWidth={isFrench() ? "140px" : "115px"}
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
                            if (!isFrench()) return;
                            window.location.reload();
                          },
                        },
                        {
                          label: "Français",
                          onClick: () => {
                            localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
                            if (isFrench()) return;
                            window.location.reload();
                          },
                        },
                      ] satisfies MenuItem[]
                    }
                    position="bottom-end"
                  >
                    <Button intent="base-100">
                      {isFrench() ? "FR" : "EN"}
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
                    class="ui-hoverable ui-gap-sm ui-pad-sm flex items-center rounded"
                    onClick={openProfile}
                  >
                    <span class="text-primary inline-block w-5">
                      <UserCircleIcon />
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
                    isGlobalAdmin={instanceState.currentUserIsGlobalAdmin}
                  />
                </Match>
                <Match
                  when={
                    tab() === "assets" &&
                    (instanceState.currentUserIsGlobalAdmin ||
                      instanceState.currentUserPermissions.can_configure_assets)
                  }
                >
                  <InstanceAssets
                    isGlobalAdmin={instanceState.currentUserIsGlobalAdmin}
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
                    isGlobalAdmin={instanceState.currentUserIsGlobalAdmin}
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
    </>
  );
}
