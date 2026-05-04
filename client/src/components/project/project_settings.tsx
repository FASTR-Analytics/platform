import {
  ProjectUser,
  PROJECT_PERMISSIONS,
  PROJECT_PERMISSION_LABELS,
  t3,
  TC,
  H_USERS,
} from "lib";
import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  FrameTop,
  HeadingBar,
  LockIcon,
  SettingsSection,
  UnlockIcon,
  openAlert,
  openComponent,
  timActionDelete,
  timActionButton,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { Match, Show, Switch, For, createSignal } from "solid-js";
import { clerk } from "~/components/LoggedInWrapper";
import { Table, TableColumn, type BulkAction } from "panther";
import { EditLabelForm } from "~/components/forms_editors/edit_label";
import { BulkEditProjectPermissionsForm } from "~/components/forms_editors/bulk_edit_project_permissions_form";
import { SelectProjectUserRole } from "~/components/forms_editors/select_project_user_role";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { CopyProjectForm } from "./copy_project";
import { CreateBackupForm } from "./create_backup_form";
import { CreateRestoreFromFileForm } from "./restore_from_file_form";
import { DisplayProjectUserRole } from "../forms_editors/display_project_user_role.tsx";
import { projectState } from "~/state/project/t1_store";

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
  backToHome: () => void;
};

export function ProjectSettings(p: Props) {
  // Actions

  async function attemptCopyProject() {
    const res = await openComponent({
      element: CopyProjectForm,
      props: {
        projectId: projectState.id,
      },
    });
    if (res) {
      await openAlert({
        title: t3({ en: "Project copy started", fr: "Copie du projet lancée" }),
        text: t3({
          en: "Your project is being copied in the background. This may take several minutes. It will appear on the home page once copying is complete.",
          fr: "Votre projet est en cours de copie en arrière-plan. Cela peut prendre plusieurs minutes. Il apparaîtra sur la page d'accueil une fois la copie terminée.",
        }),
      });
      p.backToHome();
    }
  }

  async function attemptUpdateProjectLabel() {
    const _res = await openComponent({
      element: EditLabelForm,
      props: {
        headerText: t3({
          en: "Edit project name",
          fr: "Modifier le nom du projet",
        }),
        existingLabel: projectState.label,
        mutateFunc: (newLabel) =>
          serverActions.updateProject({
            project_id: projectState.id,
            projectId: projectState.id,
            label: newLabel,
            aiContext: projectState.aiContext,
          }),
      },
    });
  }

  async function attemptUpdateProjectAiContext() {
    const _res = await openComponent({
      element: EditLabelForm,
      props: {
        headerText: t3({
          en: "Edit project context",
          fr: "Modifier le contexte du projet",
        }),
        existingLabel: projectState.aiContext,
        mutateFunc: (newAiContext) =>
          serverActions.updateProject({
            project_id: projectState.id,
            projectId: projectState.id,
            label: projectState.label,
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
        projectId: projectState.id,
        projectLabel: projectState.label,
        users,
      },
    });
  }

  async function attemptBulkEditPermissions(users: ProjectUser[]) {
    const emails = users.map((u) => u.email);
    await openComponent({
      element: BulkEditProjectPermissionsForm,
      props: {
        projectId: projectState.id,
        emails,
      },
    });
  }

  async function attemptDisplayUserRole(user: ProjectUser) {
    await openComponent({
      element: DisplayProjectUserRole,
      props: {
        projectId: projectState.id,
        user,
      },
    });
  }

  const lockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: projectState.id,
        projectId: projectState.id,
        lockAction: "lock",
      }),
    async () => {},
  );

  const unlockProject = timActionButton(
    () =>
      serverActions.setProjectLockStatus({
        project_id: projectState.id,
        projectId: projectState.id,
        lockAction: "unlock",
      }),
    async () => {},
  );

  async function attemptDeleteProject() {
    const deleteAction = timActionDelete(
      {
        text: t3({
          en: "Are you sure you want to delete this project?",
          fr: "Êtes-vous sûr de vouloir supprimer ce projet ?",
        }),
        itemList: [projectState.label],
      },
      () =>
        serverActions.deleteProject({
          project_id: projectState.id,
          projectId: projectState.id,
        }),
      async () => {},
      p.backToHome,
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3(TC.settings)}
          class="border-base-300"
          ensureHeightAsIfButton
        ></HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <SettingsSection
          header={t3({ en: "Project name", fr: "Nom du projet" })}
          rightChildren={
            <Show when={!projectState.isLocked}>
              <Button onClick={attemptUpdateProjectLabel} iconName="settings">
                {t3(TC.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{projectState.label}</div>
        </SettingsSection>
        <SettingsSection
          header={t3({ en: "Project users", fr: "Utilisateurs du projet" })}
        >
          <ProjectUserTable
            users={projectState.projectUsers}
            onUserClick={attemptSelectUserRole}
            onBulkEditPermissions={attemptBulkEditPermissions}
            onDisplayUserRole={attemptDisplayUserRole}
          />
        </SettingsSection>
        <SettingsSection
          header={t3({
            en: "Project context for AI interpretation",
            fr: "Contexte du projet pour l'interprétation de l'IA",
          })}
          rightChildren={
            <Show when={!projectState.isLocked}>
              <Button
                onClick={attemptUpdateProjectAiContext}
                iconName="settings"
              >
                {t3(TC.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">
            {projectState.aiContext ||
              t3({ en: "No context set", fr: "Aucun contexte défini" })}
          </div>
        </SettingsSection>

        <Switch>
          <Match when={projectState.isLocked}>
            <SettingsSection
              header={t3({
                en: "Project lock status",
                fr: "Statut de verrouillage du projet",
              })}
              rightChildren={
                <Button
                  onClick={unlockProject.click}
                  state={unlockProject.state()}
                >
                  {t3({ en: "Unlock project", fr: "Déverrouiller le projet" })}
                </Button>
              }
            >
              <div class="ui-gap-sm text-danger flex">
                <span class="">
                  {t3({
                    en: "Project is currently locked",
                    fr: "Le projet est actuellement verrouillé",
                  })}
                </span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <LockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
          <Match when={!projectState.isLocked}>
            <SettingsSection
              header={t3({
                en: "Project lock status",
                fr: "Statut de verrouillage du projet",
              })}
              rightChildren={
                <Button onClick={lockProject.click} state={lockProject.state()}>
                  {t3({ en: "Lock project", fr: "Verrouiller le projet" })}
                </Button>
              }
            >
              <div class="ui-gap-sm flex">
                <span class="">
                  {t3({
                    en: "Project is currently unlocked",
                    fr: "Le projet est actuellement déverrouillé",
                  })}
                </span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <UnlockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
        </Switch>

        <SettingsSection header={t3({ en: "Backups", fr: "Sauvegardes" })}>
          <ProjectBackups projectId={projectState.id} />
        </SettingsSection>

        <div class="ui-gap flex">
          <Show when={!projectState.isLocked}>
            <Button
              onClick={attemptDeleteProject}
              intent="danger"
              outline
              iconName="trash"
            >
              {t3({ en: "Delete project", fr: "Supprimer le projet" })}
            </Button>
          </Show>
          <Button onClick={attemptCopyProject} outline iconName="copy">
            {t3({ en: "Copy project", fr: "Copier le projet" })}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}

function hasPermissions(user: ProjectUser): boolean {
  return PROJECT_PERMISSIONS.some((k) => user[k]);
}

function isProjectAdmin(user: ProjectUser): boolean {
  return PROJECT_PERMISSIONS.every((k) => user[k]);
}

function getPermissionSummary(user: ProjectUser): string {
  const active = PROJECT_PERMISSIONS.filter((k) => user[k]);
  if (active.length === 0)
    return t3({ en: "Does not have access", fr: "N'a pas accès" });
  const shown = active
    .slice(0, 5)
    .map((k) => t3(PROJECT_PERMISSION_LABELS[k]))
    .join(", ");
  if (active.length > 5)
    return `${shown}, +${active.length - 5} ${t3({ en: "more", fr: "de plus" })}`;
  return shown;
}

type ProjectUserWithRole = ProjectUser & { roleSortValue: number };

function getRoleSortValue(user: ProjectUser): number {
  if (user.isGlobalAdmin) return 0;
  if (hasPermissions(user)) return 1;
  return 2;
}

function ProjectUserTable(p: {
  users: ProjectUser[];
  onUserClick?: (users: ProjectUser[]) => void;
  onBulkEditPermissions?: (users: ProjectUser[]) => void;
  onDisplayUserRole?: (user: ProjectUser) => void;
}) {
  const usersWithRole = (): ProjectUserWithRole[] =>
    p.users
      .filter((u) => !H_USERS.includes(u.email))
      .map((u) => ({ ...u, roleSortValue: getRoleSortValue(u) }));

  const columns: TableColumn<ProjectUserWithRole>[] = [
    {
      key: "firstName",
      header: t3({ en: "Name", fr: "Nom" }),
      sortable: true,
      render: (user) => {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
        return name
          ? <span class="text-sm">{name}</span>
          : <span class="text-neutral text-sm">—</span>;
      },
    },
    {
      key: "email",
      header: t3(TC.email),
      sortable: true,
    },
    {
      key: "roleSortValue",
      header: t3({ en: "Role", fr: "Rôle" }),
      sortable: true,
      render: (user) => (
        <Show
          when={user.isGlobalAdmin}
          fallback={
            <Show
              when={isProjectAdmin(user)}
              fallback={
                <span
                  class={`text-sm ${!hasPermissions(user) ? "text-neutral" : ""}`}
                >
                  {getPermissionSummary(user)}
                </span>
              }
            >
              <span class="text-primary text-sm">
                {t3({ en: "Project Admin", fr: "Administrateur du projet" })}
              </span>
            </Show>
          }
        >
          <span class="text-primary">
            {t3({
              en: "Instance administrator",
              fr: "Administrateur d'instance",
            })}
          </span>
        </Show>
      ),
    },
    {
      key: "actions",
      header: "",
      alignH: "right",
      render: (user) => (
        <div class={user.isGlobalAdmin ? "invisible" : ""}>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              p.onUserClick?.([user]);
            }}
            intent="base-100"
            iconName="pencil"
          />
        </div>
      ),
    },
  ];

  const bulkActions: BulkAction<ProjectUserWithRole>[] = [
    {
      label: t3({ en: "Edit permissions", fr: "Modifier les permissions" }),
      intent: "primary",
      outline: true,
      onClick: (users) => p.onBulkEditPermissions?.(users),
    },
  ];

  return (
    <Table
      data={usersWithRole()}
      columns={columns}
      keyField="email"
      defaultSort={{ key: "role", direction: "asc" }}
      noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur" })}
      selectionLabel={t3({ en: "user", fr: "utilisateur" })}
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

function ProjectBackups(props: { projectId: string }) {
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

  const backupsQuery = timQuery<ProjectBackupInfo[]>(async () => {
    const token = await clerk.session?.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${_SERVER_HOST}/api/all-projects-backups`, {
      headers,
    });

    if (!response.ok) {
      return {
        success: false,
        err: `Failed to fetch backups: ${response.status}`,
      };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      return { success: false, err: "Invalid response from server" };
    }

    if (!data.success) {
      return { success: false, err: data.error || "Failed to fetch backups" };
    }

    const allBackups = data.backups || [];

    const projectBackups = allBackups
      .map((backup: any) => {
        const projectFiles = backup.files.filter(
          (file: BackupFileInfo) =>
            file.type === "project" && file.name.includes(props.projectId),
        );
        if (projectFiles.length === 0) return null;
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

    return { success: true, data: projectBackups };
  });

  // Group backups by date or custom
  const getGroupedBackups = (
    backups: ProjectBackupInfo[],
  ): GroupedBackups[] => {
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
      const response = await fetch(
        `${_SERVER_HOST}/api/backups/${folder}/${fileName}`,
        {
          headers,
        },
      );
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
      const response = await fetch(`${_SERVER_HOST}/api/restore-backup`, {
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
          const response = await fetch(
            `${_SERVER_HOST}/api/create-backup/${backupName}`,
            {
              method: "POST",
              headers,
            },
          );

          if (!response.ok) {
            return { success: false as const, err: "Failed to create backup" };
          }

          const data = await response.json();

          if (!data.success) {
            return {
              success: false as const,
              err: data.error || "Backup failed",
            };
          }

          return { success: true as const };
        },
        silentFetch: async () => {
          backupsQuery.silentFetch();
        },
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
          headers["Project-Id"] = props.projectId;

          const response = await fetch(`${_SERVER_HOST}/api/restore-backup`, {
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
            return {
              success: false as const,
              err: data.error || "Failed to restore",
            };
          }

          const data = await response.json();
          if (!data.success) {
            return {
              success: false as const,
              err: data.error || "Restore failed",
            };
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
      <div class="mb-3 flex items-center justify-end">
        <div class="flex gap-2">
          <Button onClick={attemptCreateBackup} size="sm">
            {t3({ en: "Create backup", fr: "Créer une sauvegarde" })}
          </Button>
          <Button onClick={attemptRestoreBackup} size="sm">
            {t3({ en: "Restore from file", fr: "Restaurer depuis un fichier" })}
          </Button>
          <Button
            onClick={() => backupsQuery.fetch()}
            iconName="refresh"
            size="sm"
            outline
          >
            {t3({ en: "Refresh", fr: "Actualiser" })}
          </Button>
        </div>
      </div>
      <StateHolderWrapper state={backupsQuery.state()} noPad>
        {(backups) => {
          const grouped = getGroupedBackups(backups);
          return (
            <>
              <div class="text-neutral mb-3 text-sm">
                {`${backups.length} ${t3({ en: "backup(s) available", fr: "sauvegarde(s) disponible(s)" })}`}
              </div>
              <Show
                when={grouped.length > 0}
                fallback={
                  <div class="text-neutral">
                    {t3({
                      en: "No backups available for this project",
                      fr: "Aucune sauvegarde disponible pour ce projet",
                    })}
                  </div>
                }
              >
                <div class="flex flex-col gap-2">
                  <For each={grouped}>
                    {(group: GroupedBackups) => {
                      const groupKey = group.isCustom ? "custom" : group.date!;
                      const isExpanded = () => expandedGroups().has(groupKey);

                      return (
                        <div class="flex flex-col">
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
                                {group.isCustom
                                  ? t3({
                                      en: "Custom Backups",
                                      fr: "Sauvegardes personnalisées",
                                    })
                                  : group.date}
                              </span>
                              <span class="text-neutral text-sm">
                                ({group.backups.length}{" "}
                                {t3({ en: "backup", fr: "sauvegarde" })}
                                {group.backups.length !== 1 ? "s" : ""})
                              </span>
                            </div>
                          </button>

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
                                        {t3(TC.download)}
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
                                        {t3({ en: "Restore", fr: "Restaurer" })}
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
            </>
          );
        }}
      </StateHolderWrapper>
    </div>
  );
}
