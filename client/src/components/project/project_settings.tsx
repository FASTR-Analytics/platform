import { ProjectDetail, InstanceDetail, ProjectUser, t, t2, T } from "lib";
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
import { Match, Show, Switch, onMount, For, createResource } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { Table, TableColumn, type BulkAction } from "panther";
import { EditLabelForm } from "~/components/forms_editors/edit_label";
import { SelectProjectUserRole } from "~/components/forms_editors/select_project_user_role";
import { serverActions } from "~/server_actions";
import { CopyProjectForm } from "./copy_project";
import { getPropotionOfYAxisTakenUpByTicks } from "@timroberton/panther";
import { CreateBackupForm } from "./create_backup_form";
import { getInstanceDetail, updateDatasetUploadAttempt_Step1Dhis2Confirm } from "../../../../server/db/mod.ts";

// Backup types
interface BackupFileInfo {
  name: string;
  size: number;
  type: "main" | "project" | "metadata" | "log" | "other";
}

interface ProjectBackupInfo {
  project_id: string;
  project_label: string;
  folder: string;
  timestamp: string;
  backup_date: string;
  size: number;
  file_count: number;
  files: BackupFileInfo[];
}

interface BackupInfo {
  folder: string;
  timestamp: string;
  backup_date: string;
  total_projects: number;
  backed_up_projects: number;
  size: number;
  file_count: number;
  files: BackupFileInfo[];
}

type Props = {
  isGlobalAdmin: boolean;
  projectDetail: ProjectDetail;
  silentRefreshProject: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
  backToHome: () => void;
  instanceDetail: InstanceDetail;
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


        <SettingsSection
          header={t2("Backups")}
        >
          <ProjectBackups projectId={p.projectDetail.id} instanceDetail={p.instanceDetail} />
        </SettingsSection>

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




function ProjectBackups(props: { projectId: string; instanceDetail: InstanceDetail }) {
  const [backupsList, { refetch: refetchBackups }] = createResource<ProjectBackupInfo[]>(async () => {
    const token = await clerk.session?.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Call your backend endpoint which will forward to the external API
    const response = await fetch('/api/all-projects-backups', { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch backups: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch backups');
    }

    const allBackups = data.backups || [];

    // Filter backups to only include those containing this project
    const projectBackups = allBackups
      .map((backup: any) => {
        // Filter files to only include the project backups
        const projectFiles = backup.files.filter((file: BackupFileInfo) =>
          file.type === 'project' && file.name.includes(props.projectId)
        );

        // Only include this backup if it has project files
        if (projectFiles.length === 0) {
          return null;
        }

        // Calculate size of just the project files
        const projectSize = projectFiles.reduce((sum: number, file: BackupFileInfo) => sum + file.size, 0);

        return {
          ...backup,
          files: projectFiles,
          size: projectSize,
          file_count: projectFiles.length,
        };
      })
      .filter((backup: any) => backup !== null);

    return projectBackups;
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const downloadFile = async (folder: string, fileName: string) => {
    try {
      const token = await clerk.session?.getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      console.log("Downloading file:", folder, fileName);
      const response = await fetch(`/api/backups/${folder}/${fileName}`, { headers });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        console.error("Download failed:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const restoreBackup = async (folder: string, fileName: string) => {
    try {
      const token = await clerk.session?.getToken();
      const headers: HeadersInit={};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/restore-backup`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ folder, fileName })
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, err: data.error || "Failed to restore" };
      }

      const data = await response.json();
      if (!data.success) {
        return { success: false, err: data.error || "Restore failed" };
      }

      // Force full page reload after successful restore to clear all cached data
      window.location.reload();

      return { success: true};
    } catch (error) {
      console.error("Backup restore failed", error);
    }
  };

  const attemptCreateBackup = async () => {
    await openComponent({
      element: CreateBackupForm,
      props: {
        projectId: props.projectId,
        createBackupFunc: async(backupName: string) => {
          const token = await clerk.session?.getToken();
          const headers: HeadersInit = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          const response = await fetch(`/api/create-backup/${backupName}`, { 
            method: 'POST',
            headers 
          });

          if (!response.ok) {
            return { success: false, err: "Failed to create backup" };
          }

          const data = await response.json();
        
          if (!data.success) {
            return { success: false, err: data.error || "Backup failed" };
          }
          
          return { success: true };
        },
        silentFetch: refetchBackups,
      }
    })
  };

  return (
    <div>
      <div class="mb-3 flex items-center justify-between">
        <div class="text-sm text-neutral">
          {backupsList.loading ? "" : `${backupsList()?.length || 0} backup(s) available`}
        </div>
        <div class="flex gap-2">
          <Button onClick={attemptCreateBackup} size="sm">
            {t("Create backup")}
          </Button>
          <Button onClick={() => refetchBackups()} iconName="refresh" size="sm" outline>
            {t("Refresh")}
          </Button>
        </div>
      </div>
      <Show when={!backupsList.loading} fallback={<div>Loading backups...</div>}>
        <Show
          when={backupsList() && backupsList()!.length > 0}
          fallback={<div class="text-neutral">No backups available for this project</div>}
        >
          <div class="flex flex-col gap-2">
            <For each={backupsList()}>
              {(backup: ProjectBackupInfo) => (
                <div class="flex items-center justify-between rounded border border-neutral-200 p-3">
                  <div class="flex flex-col gap-1">
                    <span class="font-medium">{backup.folder}</span>
                    <span class="text-sm text-neutral">
                      {formatBytes(backup.size)}
                    </span>
                  </div>
                  <div class="flex gap-2">                    
                    <Button
                      onClick={() => downloadFile(backup.folder, backup.files[0].name)}
                      iconName="download"
                      intent="primary"
                      size="sm"
                    >
                      Download
                    </Button>
                    <Button
                      onClick={() => restoreBackup(backup.folder,backup.files[0].name)}
                      size="sm"
                      outline
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
