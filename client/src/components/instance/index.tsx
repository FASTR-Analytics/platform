import { useSearchParams } from "@solidjs/router";
import { GlobalUser, isFrench, t3, TC } from "lib";
import {
  AlertProvider,
  Button,
  ButtonGroup,
  FrameTop,
  PopoverMenuProvider,
  UserCircleIcon,
  getEditorWrapper,
  getFirstString,
  openComponent,
  timQuery,
} from "panther";
import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import { InstanceAssets } from "~/components/instance/instance_assets";
import { InstanceData } from "~/components/instance/instance_data";
import { InstanceProjects } from "~/components/instance/instance_projects";
import { InstanceUsers } from "~/components/instance/instance_users";
import { serverActions } from "~/server_actions";
import { Dhis2CredentialsForm } from "../forms_editors/dhis2_credentials_form";
import Project from "../project";
import { HelpForm } from "./help_form";
import { InstanceMetaForm } from "./instance_meta_form";
import { InstanceSettings } from "./instance_settings";
import { ProfileForm } from "./profile";
import {
  clearDhis2SessionCredentials,
  getDhis2SessionCredentials,
  setDhis2SessionCredentials,
} from "~/state/dhis2-session-storage";
import { clerk } from "~/components/LoggedInWrapper";
import { EmailOptInModal } from "~/components/email_opt_in_modal";


type Props = {
  globalUser: GlobalUser;
  attemptSignOut: () => Promise<void>;
};

export default function Instance(p: Props) {
  const [searchParams] = useSearchParams();
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const [tab, setTab] = createSignal<
    "projects" | "users" | "data" | "assets" | "settings"
  >("projects");

  // email opt in modal   
  onMount(async () => {
    if (!clerk.user) return; // skips dev bypass mode naturally
    if (!clerk.user.unsafeMetadata?.emailOptInAsked) {
      await openComponent({
        element: EmailOptInModal,
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

  async function openHelp() {
    await openComponent({
      element: HelpForm,
      props: {},
    });
  }

  async function handleDhis2Credentials() {
    const credentials = getDhis2SessionCredentials();

    const result = await openComponent({
      element: Dhis2CredentialsForm,
      props: {
        existingCredentials: credentials ?? undefined,
        allowClear: credentials !== null,
      },
    });

    if (result === undefined) {
      return;
    }

    if (result.shouldClear) {
      clearDhis2SessionCredentials();
      return;
    }

    if (result.credentials) {
      setDhis2SessionCredentials(result.credentials);
    }
  }

  const instanceDetail = timQuery(
    () => serverActions.getInstanceDetail({}),
    t3({ en: "Loading instance info...", fr: "Chargement des informations de l'instance..." }),
  );

  return (
    <>
      <Switch>
        <Match when={getFirstString(searchParams.p)}>
          <Project
            projectId={getFirstString(searchParams.p)!}
            isGlobalAdmin={p.globalUser.isGlobalAdmin}
            instanceDetail={instanceDetail}
          />
        </Match>
        <Match when={true}>
          <FrameTop
            panelChildren={
              <div class="ui-pad ui-gap bg-base-100 text-base-content flex items-center">
                <div class="flex-0 flex items-center">
                  <div class="border-base-300 font-700 text-nowrap border-r pr-4 text-2xl antialiased">
                    {p.globalUser.instanceName}
                  </div>
                  <div class="w-24 flex-none pl-4">
                    <img
                      src="/images/logo.png"
                      class="h-4 w-24 object-contain"
                    />
                  </div>
                </div>
                <Show when={p.globalUser.approved}>
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
                        ...(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_users || p.globalUser.thisUserPermissions.can_view_users
                          ? [
                            {
                              value: "users",
                              iconName: "users",
                            },
                          ]
                          : ([] as any)),
                        ...(p.globalUser.isGlobalAdmin
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
                        ...(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_view_data || p.globalUser.thisUserPermissions.can_configure_data
                        ? [
                          {
                            value: "data",
                            label: t3({ en: "Data", fr: "Données" }),
                            iconName: "database",
                          },
                        ]
                        : ([] as any)),
                        ...(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_assets
                        ?  [
                          {
                            value: "assets",
                            label: t3({ en: "Assets", fr: "Ressources" }),
                            iconName: "package",
                          },
                        ]
                        : ([] as any)),
                        ...(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_users || p.globalUser.thisUserPermissions.can_view_users
                          ? [
                            {
                              value: "users",
                              label: t3({ en: "Users", fr: "Utilisateurs" }),
                              iconName: "users",
                            },
                          ]
                          : ([] as any)),
                        ...(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_settings
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
                <div class="flex-0 ui-gap-sm flex items-center justify-end">
                  <Show when={p.globalUser.approved}>
                    <Button
                      onClick={openHelp}
                      iconName="help"
                      intent="base-100"
                    />
                    <Button
                      onClick={openInstanceMeta}
                      iconName="versions"
                      intent="base-100"
                    >
                      {/* {t2(T.Platform.platforme)} */}
                    </Button>
                    <Button
                      onClick={handleDhis2Credentials}
                      iconName="database"
                      intent="base-100"
                    >
                      {/* {t("DHIS2")} */}
                    </Button>
                  </Show>
                  <div
                    class="ui-hoverable ui-gap-sm ui-pad-sm flex items-center rounded"
                    onClick={openProfile}
                  >
                    <span class="text-primary inline-block w-5">
                      <UserCircleIcon />
                    </span>
                    <span class="font-400 text-base-content truncate text-sm">
                      <span class="font-700">
                        {p.globalUser.firstName} {p.globalUser.lastName}
                      </span>
                      <Show when={p.globalUser.isGlobalAdmin}>
                        {" "}
                        ({t3({ en: "Admin", fr: "Admin" })})
                      </Show>
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <EditorWrapper>
              <Show
                when={p.globalUser.approved}
                fallback={
                  <div class="ui-pad">
                    {t3({ en: "You are not yet approved. Wait for an administrator to add you to the platform.", fr: "Vous n'êtes pas encore approuvé. Veuillez attendre qu'un administrateur vous ajoute à la plateforme." })}
                  </div>
                }
              >
                <Switch fallback={t3({ en: "Bad tab", fr: "Onglet invalide" })}>
                  <Match when={tab() === "projects"}>
                    <InstanceProjects
                      isGlobalAdmin={p.globalUser.isGlobalAdmin}
                      canCreateProjects={p.globalUser.thisUserPermissions.can_create_projects}
                      instanceDetail={instanceDetail}
                    />
                  </Match>
                  <Match when={tab() === "data" && (p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_view_data || p.globalUser.thisUserPermissions.can_configure_data)}>
                    <InstanceData
                      isGlobalAdmin={p.globalUser.isGlobalAdmin}
                      instanceDetail={instanceDetail}
                    />
                  </Match>
                  <Match when={tab() === "assets" && (p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_assets)}>
                    <InstanceAssets
                      isGlobalAdmin={p.globalUser.isGlobalAdmin}
                      instanceDetail={instanceDetail}
                    />
                  </Match>
                  <Match when={(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_users || p.globalUser.thisUserPermissions.can_view_users) && tab() === "users"}>
                    <InstanceUsers
                      thisLoggedInUserEmail={p.globalUser.email}
                      instanceDetail={instanceDetail}
                    />
                  </Match>
                  <Match
                    when={(p.globalUser.isGlobalAdmin || p.globalUser.thisUserPermissions.can_configure_settings) && tab() === "settings"}
                  >
                    <InstanceSettings
                      thisLoggedInUserEmail={p.globalUser.email}
                      instanceDetail={instanceDetail}
                    />
                  </Match>
                </Switch>
              </Show>
            </EditorWrapper>
          </FrameTop>
        </Match>
      </Switch>
      <AlertProvider />
      <PopoverMenuProvider />
    </>
  );
}
