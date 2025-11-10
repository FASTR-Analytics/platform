import { ProjectDetail, ProjectUser, t, t2, T } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  LockIcon,
  SettingsSection,
  UnlockIcon,
  openComponent,
  timActionDelete,
  timActionButton,
} from "panther";
import { Match, Show, Switch } from "solid-js";
import { Table, TableColumn, type BulkAction } from "panther";
import { EditLabelForm } from "~/components/forms_editors/edit_label";
import { SelectProjectUserRole } from "~/components/forms_editors/select_project_user_role";
import { serverActions } from "~/server_actions";
import { CopyProjectForm } from "./copy_project";

type Props = {
  isGlobalAdmin: boolean;
  projectDetail: ProjectDetail;
  silentRefreshProject: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
  backToHome: () => void;
};

export function ProjectSettings(p: Props) {
  // Actions

  async function attemptCopyProject() {
    const res = await openComponent({
      element: CopyProjectForm,
      props: {
        projectId: p.projectDetail.id,
        silentFetch: p.silentRefreshInstance,
      },
    });
    if (res) {
      p.backToHome();
    }
  }

  async function attemptUpdateProjectLabel() {
    const _res = await openComponent({
      element: EditLabelForm,
      props: {
        headerText: t2(T.FRENCH_UI_STRINGS.edit_project_name),
        existingLabel: p.projectDetail.label,
        mutateFunc: (newLabel) =>
          serverActions.updateProject({
            project_id: p.projectDetail.id,
            label: newLabel,
            aiContext: p.projectDetail.aiContext,
          }),
        silentFetch: p.silentRefreshProject,
      },
    });
  }

  async function attemptUpdateProjectAiContext() {
    const _res = await openComponent({
      element: EditLabelForm,
      props: {
        headerText: t("Edit project context"),
        existingLabel: p.projectDetail.aiContext,
        mutateFunc: (newAiContext) =>
          serverActions.updateProject({
            project_id: p.projectDetail.id,
            label: p.projectDetail.label,
            aiContext: newAiContext,
          }),
        silentFetch: p.silentRefreshProject,
        textArea: true,
      },
    });
  }

  async function attemptSelectUserRole(users: ProjectUser[]) {
    await openComponent({
      element: SelectProjectUserRole,
      props: {
        projectId: p.projectDetail.id,
        projectLabel: p.projectDetail.label,
        users,
        silentFetch: p.silentRefreshProject,
      },
    });
  }

  const lockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: p.projectDetail.id,
        lockAction: "lock",
      }),
    async () => {
      await p.silentRefreshProject();
      await p.silentRefreshInstance();
    },
  );

  const unlockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: p.projectDetail.id,
        lockAction: "unlock",
      }),
    async () => {
      await p.silentRefreshProject();
      await p.silentRefreshInstance();
    },
  );

  async function attemptDeleteProject() {
    const deleteAction = timActionDelete(
      {
        text: t("Are you sure you want to delete this project?"),
        itemList: [p.projectDetail.label],
      },
      () => serverActions.deleteProject({ project_id: p.projectDetail.id }),
      p.silentRefreshInstance,
      p.backToHome,
    );

    await deleteAction.click();
  }

  return (
    <FrameTop panelChildren={<HeadingBar heading={t2(T.FRENCH_UI_STRINGS.settings)}></HeadingBar>}>
      <div class="ui-pad ui-spy">
        <SettingsSection
          header={t2(T.FRENCH_UI_STRINGS.project_name)}
          rightChildren={
            <Show when={!p.projectDetail.isLocked}>
              <Button onClick={attemptUpdateProjectLabel} iconName="settings">
                {t2(T.FRENCH_UI_STRINGS.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{p.projectDetail.label}</div>
        </SettingsSection>
        <SettingsSection header={t2(T.FRENCH_UI_STRINGS.project_users)}>
          <ProjectUserTable
            users={p.projectDetail.projectUsers}
            onUserClick={attemptSelectUserRole}
          />
        </SettingsSection>
        <SettingsSection
          header={t2(T.Paramètres.project_context_ai)}
          rightChildren={
            <Show when={!p.projectDetail.isLocked}>
              <Button
                onClick={attemptUpdateProjectAiContext}
                iconName="settings"
              >
                {t2(T.FRENCH_UI_STRINGS.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{p.projectDetail.aiContext || "No context set"}</div>
        </SettingsSection>
        <Switch>
          <Match when={p.projectDetail.isLocked}>
            <SettingsSection
              header={t2(T.Paramètres.project_lock_status)}
              rightChildren={
                <Button
                  onClick={unlockProject.click}
                  state={unlockProject.state()}
                >
                  {t("Unlock project")}
                </Button>
              }
            >
              <div class="ui-gap-sm text-danger flex">
                <span class="">Project is currently locked</span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <LockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
          <Match when={!p.projectDetail.isLocked}>
            <SettingsSection
              header={t2(T.Paramètres.project_lock_status)}
              rightChildren={
                <Button onClick={lockProject.click} state={lockProject.state()}>
                  {t2(T.Paramètres.lock_project)}
                </Button>
              }
            >
              <div class="ui-gap-sm flex">
                <span class="">Project is currently unlocked</span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <UnlockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
        </Switch>

        <div class="ui-gap flex">
          <Show when={!p.projectDetail.isLocked}>
            <Button
              onClick={attemptDeleteProject}
              intent="danger"
              outline
              iconName="trash"
            >
              {t2(T.FRENCH_UI_STRINGS.delete_project)}
            </Button>
          </Show>
          <Button onClick={attemptCopyProject} outline iconName="copy">
            {t2(T.Paramètres.copy_project)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}

function ProjectUserTable(p: {
  users: ProjectUser[];
  onUserClick?: (users: ProjectUser[]) => void;
}) {
  const columns: TableColumn<ProjectUser>[] = [
    {
      key: "email",
      header: t2(T.FRENCH_UI_STRINGS.email),
      sortable: true,
    },
    {
      key: "role",
      header: t2(T.Paramètres.role),
      sortable: true,
      render: (user) => (
        <Show
          when={user.isGlobalAdmin}
          fallback={
            <Switch>
              <Match when={user.role === "editor"}>
                <span class="text-primary">{t("Project editor")}</span>
              </Match>
              <Match when={user.role === "viewer"}>
                <span>{t("Project viewer")}</span>
              </Match>
              <Match when={user.role === "none"}>
                <span class="text-neutral">
                  {t2(T.FRENCH_UI_STRINGS.no_permissions_for_this_projec)}
                </span>
              </Match>
            </Switch>
          }
        >
          <span class="text-primary">{t2(T.Paramètres.instance_admin)}</span>
        </Show>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (user) => (
        <Button
          onClick={(e) => {
            e.stopPropagation();
            p.onUserClick?.([user]);
          }}
          intent="base-100"
          disabled={user.isGlobalAdmin}
        >
          {t2(T.FRENCH_UI_STRINGS.edit)}
        </Button>
      ),
    },
  ];

  const bulkActions: BulkAction<ProjectUser>[] = [
    {
      label: t("Edit user's project role"),
      intent: "primary",
      onClick: (users) => p.onUserClick?.(users),
    },
  ];

  return (
    <Table
      data={p.users}
      columns={columns}
      keyField="email"
      noRowsMessage={t("No users")}
      selectionLabel="user"
      bulkActions={bulkActions}
      tableContentMaxHeight="500px"
    />
  );
}
