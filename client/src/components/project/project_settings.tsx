import { ProjectDetail, InstanceDetail, ProjectUser, t, t2, T } from "lib";
import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  FrameTop,
  HeadingBar,
  LockIcon,
  SettingsSection,
  UnlockIcon,
  openComponent,
  timActionDelete,
  timActionButton,
} from "panther";
import {
  Match,
  Show,
  Switch,
  onMount,
  For,
  createResource,
  createSignal,
} from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { Table, TableColumn, type BulkAction } from "panther";
import { EditLabelForm } from "~/components/forms_editors/edit_label";
import { SelectProjectUserRole } from "~/components/forms_editors/select_project_user_role";
import { serverActions } from "~/server_actions";
import { CopyProjectForm } from "./copy_project";
import { getPropotionOfYAxisTakenUpByTicks } from "@timroberton/panther";
import { CreateBackupForm } from "./create_backup_form";
import { CreateRestoreFromFileForm } from "./restore_from_file_form";
import { DisplayProjectUserRole } from "../forms_editors/display_project_user_role.tsx";
import { useProjectDetail, useRefetchProjectDetail } from "~/components/project_runner/mod";

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
  silentRefreshInstance: () => Promise<void>;
  backToHome: () => void;
  instanceDetail: InstanceDetail;
};

export function ProjectSettings(p: Props) {
  const projectDetail = useProjectDetail();
  const refetchProjectDetail = useRefetchProjectDetail();
  // Actions

  async function attemptCopyProject() {
    const res = await openComponent({
      element: CopyProjectForm,
      props: {
        projectId: projectDetail.id,
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
        existingLabel: projectDetail.label,
        mutateFunc: (newLabel) =>
          serverActions.updateProject({
            project_id: projectDetail.id,
            projectId: projectDetail.id,
            label: newLabel,
            aiContext: projectDetail.aiContext,
          }),
      },
    });
  }

  async function attemptUpdateProjectAiContext() {
    const _res = await openComponent({
      element: EditLabelForm,
      props: {
        headerText: t("Edit project context"),
        existingLabel: projectDetail.aiContext,
        mutateFunc: (newAiContext) =>
          serverActions.updateProject({
            project_id: projectDetail.id,
            projectId: projectDetail.id,
            label: projectDetail.label,
            aiContext: newAiContext,
          }),
        textArea: true,
      },
    });
  }

  async function attemptSelectUserRole(users: ProjectUser[]) {
    await openComponent({
      element: SelectProjectUserRole,
      props: {
        projectId: projectDetail.id,
        projectLabel: projectDetail.label,
        users,
        silentFetch: refetchProjectDetail,
      },
    });
  }

  async function attemptDisplayUserRole(user: ProjectUser) {
    await openComponent({
      element: DisplayProjectUserRole,
      props: {
        projectId: projectDetail.id,
        user,
      },
    });
  }

  const lockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: projectDetail.id,
        projectId: projectDetail.id,
        lockAction: "lock",
      }),
    async () => {
      await p.silentRefreshInstance();
    },
  );

  const unlockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: projectDetail.id,
        projectId: projectDetail.id,
        lockAction: "unlock",
      }),
    async () => {
      await p.silentRefreshInstance();
    },
  );

  async function attemptDeleteProject() {
    const deleteAction = timActionDelete(
      {
        text: t("Are you sure you want to delete this project?"),
        itemList: [projectDetail.label],
      },
      () =>
        serverActions.deleteProject({
          project_id: projectDetail.id,
          projectId: projectDetail.id,
        }),
      p.silentRefreshInstance,
      p.backToHome,
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t2(T.FRENCH_UI_STRINGS.settings)}
          class="border-base-300"
          ensureHeightAsIfButton
        ></HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <SettingsSection
          header={t2(T.FRENCH_UI_STRINGS.project_name)}
          rightChildren={
            <Show when={!projectDetail.isLocked}>
              <Button onClick={attemptUpdateProjectLabel} iconName="settings">
                {t2(T.FRENCH_UI_STRINGS.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{projectDetail.label}</div>
        </SettingsSection>
        <SettingsSection header={t2(T.FRENCH_UI_STRINGS.project_users)}>
          <ProjectUserTable
            users={projectDetail.projectUsers}
            onUserClick={attemptSelectUserRole}
            onDisplayUserRole={attemptDisplayUserRole}
          />
        </SettingsSection>
        <SettingsSection
          header={t2(T.Paramètres.project_context_ai)}
          rightChildren={
            <Show when={!projectDetail.isLocked}>
              <Button
                onClick={attemptUpdateProjectAiContext}
                iconName="settings"
              >
                {t2(T.FRENCH_UI_STRINGS.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{projectDetail.aiContext || "No context set"}</div>
        </SettingsSection>

        <Switch>
          <Match when={projectDetail.isLocked}>
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
          <Match when={!projectDetail.isLocked}>
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

        <SettingsSection header={t2("Backups")}>
          <ProjectBackups
            projectId={projectDetail.id}
            instanceDetail={p.instanceDetail}
          />
        </SettingsSection>

        <div class="ui-gap flex">
          <Show when={!projectDetail.isLocked}>
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

const permissionLabels: { key: keyof ProjectUser; label: string }[] = [
  { key: "can_view_reports", label: "View reports" },
  { key: "can_view_visualizations", label: "View visualizations" },
  { key: "can_view_slide_decks", label: "View slide decks" },
  { key: "can_view_data", label: "View data" },
  { key: "can_view_logs", label: "View logs" },
  { key: "can_configure_settings", label: "Configure settings" },
  { key: "can_configure_modules", label: "Configure modules" },
  { key: "can_run_modules", label: "Run modules" },
  { key: "can_configure_users", label: "Configure users" },
  { key: "can_configure_visualizations", label: "Configure visualizations" },
  { key: "can_configure_reports", label: "Configure reports" },
  { key: "can_configure_slide_decks", label: "Configure slide decks" },
  { key: "can_configure_data", label: "Configure data" },
  { key: "can_create_backups", label: "Create backups" },
  { key: "can_restore_backups", label: "Restore backups" },
];

function getPermissionSummary(user: ProjectUser): string {
  if (user.hasProjectAccess === false) return "Does not have access";
  const active = permissionLabels.filter((p) => user[p.key]);
  if (active.length === 0) return "No permissions";
  const shown = active.slice(0, 5).map((p) => p.label).join(", ");
  if (active.length > 5) return `${shown}, +${active.length - 5} more`;
  return shown;
}

function ProjectUserTable(p: {
  users: ProjectUser[];
  onUserClick?: (users: ProjectUser[]) => void;
  onDisplayUserRole?: (user: ProjectUser) => void;
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
            <span
              class={`text-sm ${getPermissionSummary(user) === "Does not have access" ? "text-neutral" : "text-primary cursor-pointer hover:underline"}`}
              onClick={() => {
                if (getPermissionSummary(user) !== "Does not have access") {
                  p.onDisplayUserRole?.(user);
                }
              }}
            >
              {getPermissionSummary(user)}
            </span>
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

// Helper to check if a backup name matches the automatic date format
const isAutomaticBackup = (folderName: string): boolean => {
  // Match format: YYYY-MM-DD_HH-MM-SS
  const datePattern = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
  return datePattern.test(folderName);
};

// Helper to extract date from automatic backup folder name
const extractDate = (folderName: string): string => {
  return folderName.split("_")[0]; // Returns "YYYY-MM-DD"
};

interface GroupedBackups {
  date?: string; // For automatic backups grouped by date
  isCustom?: boolean; // For custom backups folder
  backups: ProjectBackupInfo[];
}

function ProjectBackups(props: {
  projectId: string;
  instanceDetail: InstanceDetail;
}) {
  const [expandedGroups, setExpandedGroups] = createSignal<Set<string>>(
    new Set(),
  );

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const [backupsList, { refetch: refetchBackups }] = createResource<
    ProjectBackupInfo[]
  >(async () => {
    const token = await clerk.session?.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch("/api/all-projects-backups", { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch backups: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to fetch backups");
    }

    const allBackups = data.backups || [];

    // Filter backups to only include those containing this project
    const projectBackups = allBackups
      .map((backup: any) => {
        // Filter files to only include the project backups
        const projectFiles = backup.files.filter(
          (file: BackupFileInfo) =>
            file.type === "project" && file.name.includes(props.projectId),
        );

        // Only include this backup if it has project files
        if (projectFiles.length === 0) {
          return null;
        }

        // Calculate size of just the project files
        const projectSize = projectFiles.reduce(
          (sum: number, file: BackupFileInfo) => sum + file.size,
          0,
        );

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

  // Group backups by date or custom
  const groupedBackups = (): GroupedBackups[] => {
    const backups = backupsList();
    if (!backups) return [];

    const dateGroups = new Map<string, ProjectBackupInfo[]>();
    const customBackups: ProjectBackupInfo[] = [];

    backups.forEach((backup: ProjectBackupInfo) => {
      if (isAutomaticBackup(backup.folder)) {
        const date = extractDate(backup.folder);
        if (!dateGroups.has(date)) {
          dateGroups.set(date, []);
        }
        dateGroups.get(date)!.push(backup);
      } else {
        customBackups.push(backup);
      }
    });

    const groups: GroupedBackups[] = [];

    // Add date groups (sorted newest first)
    const sortedDates = Array.from(dateGroups.keys()).sort((a, b) =>
      b.localeCompare(a),
    );
    sortedDates.forEach((date) => {
      const backupsInGroup = dateGroups.get(date)!;
      // Sort backups within the group by time (newest first)
      backupsInGroup.sort((a, b) => b.folder.localeCompare(a.folder));
      groups.push({
        date,
        backups: backupsInGroup,
      });
    });

    // Add custom backups group if any exist
    if (customBackups.length > 0) {
      customBackups.sort((a, b) => b.folder.localeCompare(a.folder));
      groups.push({
        isCustom: true,
        backups: customBackups,
      });
    }

    return groups;
  };

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
      const headers: HeadersInit = {
        "Project-Id": props.projectId,
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      console.log("Downloading file:", folder, fileName);
      const response = await fetch(`/api/backups/${folder}/${fileName}`, {
        headers,
      });
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
      const headers: HeadersInit = {};
      const projectId = props.projectId;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      headers["Content-Type"] = "application/json";
      headers["Project-Id"] = projectId;
      const response = await fetch(`/api/restore-backup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ folder, fileName, projectId }),
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

      return { success: true };
    } catch (error) {
      console.error("Backup restore failed", error);
    }
  };

  const attemptCreateBackup = async () => {
    await openComponent({
      element: CreateBackupForm,
      props: {
        projectId: props.projectId,
        createBackupFunc: async (backupName: string) => {
          const token = await clerk.session?.getToken();
          const headers: HeadersInit = {
            "Project-Id": props.projectId,
          };
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          const response = await fetch(`/api/create-backup/${backupName}`, {
            method: "POST",
            headers,
          });

          if (!response.ok) {
            return { success: false as const, err: "Failed to create backup" };
          }

          const data = await response.json();

          if (!data.success) {
            return { success: false as const, err: data.error || "Backup failed" };
          }

          return { success: true as const };
        },
        silentFetch: async () => { refetchBackups(); },
      },
    });
  };

  const attemptRestoreBackup = async () => {
    await openComponent({
      element: CreateRestoreFromFileForm,
      props: {
        restoreBackupFunc: async (file: File) => {
          // Read file as base64 (handle large files properly)
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(bytes.subarray(i, i + chunkSize)),
            );
          }
          const base64 = btoa(binary);

          const token = await clerk.session?.getToken();
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          const response = await fetch(`/api/restore-backup`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              projectId: props.projectId,
              fileData: base64,
              fileName: file.name,
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            return { success: false as const, err: data.error || "Failed to restore" };
          }

          const data = await response.json();
          if (!data.success) {
            return { success: false as const, err: data.error || "Restore failed" };
          }

          // Force full page reload after successful restore to clear all cached data
          window.location.reload();

          return { success: true as const };
        },
      },
    });
  };

  const formatTime = (folderName: string): string => {
    // Extract time from YYYY-MM-DD_HH-MM-SS format
    const timePart = folderName.split("_")[1];
    if (!timePart) return folderName;
    return timePart.replace(/-/g, ":");
  };

  return (
    <div>
      <div class="mb-3 flex items-center justify-between">
        <div class="text-neutral text-sm">
          {backupsList.loading
            ? ""
            : `${backupsList()?.length || 0} backup(s) available`}
        </div>
        <div class="flex gap-2">
          <Button onClick={attemptCreateBackup} size="sm">
            {t("Create backup")}
          </Button>
          <Button onClick={attemptRestoreBackup} size="sm">
            {t("Restore from file")}
          </Button>
          <Button
            onClick={() => refetchBackups()}
            iconName="refresh"
            size="sm"
            outline
          >
            {t("Refresh")}
          </Button>
        </div>
      </div>
      <Show
        when={!backupsList.loading}
        fallback={<div>Loading backups...</div>}
      >
        <Show
          when={backupsList() && backupsList()!.length > 0}
          fallback={
            <div class="text-neutral">
              No backups available for this project
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={groupedBackups()}>
              {(group: GroupedBackups) => {
                const groupKey = group.isCustom ? "custom" : group.date!;
                const isExpanded = () => expandedGroups().has(groupKey);

                return (
                  <div class="flex flex-col">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      class="flex items-center justify-between rounded border border-neutral-200 bg-neutral-50 p-3 text-left transition-colors hover:bg-neutral-100"
                    >
                      <div class="flex items-center gap-2">
                        <Show
                          when={isExpanded()}
                          fallback={<ChevronRightIcon />}
                        >
                          <ChevronDownIcon />
                        </Show>
                        <span class="font-medium">
                          {group.isCustom ? "Custom Backups" : group.date}
                        </span>
                        <span class="text-neutral text-sm">
                          ({group.backups.length} backup
                          {group.backups.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </button>

                    {/* Expanded Backups */}
                    <Show when={isExpanded()}>
                      <div class="mt-2 ml-6 flex flex-col gap-2">
                        <For each={group.backups}>
                          {(backup: ProjectBackupInfo) => (
                            <div class="flex items-center justify-between rounded border border-neutral-200 bg-white p-3">
                              <div class="flex flex-col gap-1">
                                <span class="font-medium">
                                  {group.isCustom
                                    ? backup.folder
                                    : formatTime(backup.folder)}
                                </span>
                                <span class="text-neutral text-sm">
                                  {formatBytes(backup.size)}
                                </span>
                              </div>
                              <div class="flex gap-2">
                                <Button
                                  onClick={() =>
                                    downloadFile(
                                      backup.folder,
                                      backup.files[0].name,
                                    )
                                  }
                                  iconName="download"
                                  intent="primary"
                                  size="sm"
                                >
                                  Download
                                </Button>
                                <Button
                                  onClick={() =>
                                    restoreBackup(
                                      backup.folder,
                                      backup.files[0].name,
                                    )
                                  }
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
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
