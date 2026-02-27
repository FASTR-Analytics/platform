import { ProjectDetail, InstanceDetail, ProjectUser, t3, TC } from "lib";
import type { TranslatableString } from "lib";
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
import { BulkEditProjectPermissionsForm } from "~/components/forms_editors/bulk_edit_project_permissions_form";
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
        headerText: t3({ en: "Edit project name", fr: "Modifier le nom du projet" }),
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
        headerText: t3({ en: "Edit project context", fr: "Modifier le contexte du projet" }),
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

  async function attemptBulkEditPermissions(users: ProjectUser[]) {
    const emails = users.map((u) => u.email);
    await openComponent({
      element: BulkEditProjectPermissionsForm,
      props: {
        projectId: projectDetail.id,
        emails,
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
        text: t3({ en: "Are you sure you want to delete this project?", fr: "Êtes-vous sûr de vouloir supprimer ce projet ?" }),
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
            <Show when={!projectDetail.isLocked}>
              <Button onClick={attemptUpdateProjectLabel} iconName="settings">
                {t3(TC.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{projectDetail.label}</div>
        </SettingsSection>
        <SettingsSection header={t3({ en: "Project users", fr: "Utilisateurs du projet" })}>
          <ProjectUserTable
            users={projectDetail.projectUsers}
            onUserClick={attemptSelectUserRole}
            onBulkEditPermissions={attemptBulkEditPermissions}
            onDisplayUserRole={attemptDisplayUserRole}
          />
        </SettingsSection>
        <SettingsSection
          header={t3({ en: "Project context for AI interpretation", fr: "Contexte du projet pour l'interprétation de l'IA" })}
          rightChildren={
            <Show when={!projectDetail.isLocked}>
              <Button
                onClick={attemptUpdateProjectAiContext}
                iconName="settings"
              >
                {t3(TC.edit)}
              </Button>
            </Show>
          }
        >
          <div class="">{projectDetail.aiContext || t3({ en: "No context set", fr: "Aucun contexte défini" })}</div>
        </SettingsSection>

        <Switch>
          <Match when={projectDetail.isLocked}>
            <SettingsSection
              header={t3({ en: "Project lock status", fr: "Statut de verrouillage du projet" })}
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
                <span class="">{t3({ en: "Project is currently locked", fr: "Le projet est actuellement verrouillé" })}</span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <LockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
          <Match when={!projectDetail.isLocked}>
            <SettingsSection
              header={t3({ en: "Project lock status", fr: "Statut de verrouillage du projet" })}
              rightChildren={
                <Button onClick={lockProject.click} state={lockProject.state()}>
                  {t3({ en: "Lock project", fr: "Verrouiller le projet" })}
                </Button>
              }
            >
              <div class="ui-gap-sm flex">
                <span class="">{t3({ en: "Project is currently unlocked", fr: "Le projet est actuellement déverrouillé" })}</span>
                <span class="relative inline-flex h-[1.25em] w-[1.25em]">
                  <UnlockIcon />
                </span>
              </div>
            </SettingsSection>
          </Match>
        </Switch>

        <SettingsSection header={t3({ en: "Backups", fr: "Sauvegardes" })}>
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

const permissionLabels: { key: keyof ProjectUser; label: TranslatableString }[] = [
  { key: "can_view_reports", label: { en: "View reports", fr: "Consulter les rapports" } },
  { key: "can_view_visualizations", label: { en: "View visualizations", fr: "Consulter les visualisations" } },
  { key: "can_view_slide_decks", label: { en: "View slide decks", fr: "Consulter les présentations" } },
  { key: "can_view_data", label: { en: "View data", fr: "Consulter les données" } },
  { key: "can_view_metrics", label: { en: "View metrics", fr: "Consulter les métriques" } },
  { key: "can_view_script_code", label: { en: "View script code", fr: "Consulter le code des scripts" } },
  { key: "can_view_logs", label: { en: "View logs", fr: "Consulter les journaux" } },
  { key: "can_configure_settings", label: { en: "Configure settings", fr: "Configurer les paramètres" } },
  { key: "can_configure_modules", label: { en: "Configure modules", fr: "Configurer les modules" } },
  { key: "can_run_modules", label: { en: "Run modules", fr: "Exécuter les modules" } },
  { key: "can_configure_users", label: { en: "Configure users", fr: "Configurer les utilisateurs" } },
  { key: "can_configure_visualizations", label: { en: "Configure visualizations", fr: "Configurer les visualisations" } },
  { key: "can_configure_reports", label: { en: "Configure reports", fr: "Configurer les rapports" } },
  { key: "can_configure_slide_decks", label: { en: "Configure slide decks", fr: "Configurer les présentations" } },
  { key: "can_configure_data", label: { en: "Configure data", fr: "Configurer les données" } },
  { key: "can_create_backups", label: { en: "Create backups", fr: "Créer des sauvegardes" } },
  { key: "can_restore_backups", label: { en: "Restore backups", fr: "Restaurer des sauvegardes" } },
];

function hasPermissions(user: ProjectUser): boolean {
  return permissionLabels.some((p) => user[p.key]);
}

function getPermissionSummary(user: ProjectUser): string {
  const active = permissionLabels.filter((p) => user[p.key]);
  if (active.length === 0) return t3({ en: "Does not have access", fr: "N'a pas accès" });
  const shown = active.slice(0, 5).map((p) => t3(p.label)).join(", ");
  if (active.length > 5) return `${shown}, +${active.length - 5} ${t3({ en: "more", fr: "de plus" })}`;
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
  const HIDDEN_EMAILS = new Set([
    "timroberton@gmail.com",
    "asheffel@worldbank.org",
    "alopezhernandez@worldbank.org",
    "claire.boulange@gmail.com",
    "meghanpaul00@gmail.com",
    "nick@usefuldata.com.au",
  ]);

  const usersWithRole = (): ProjectUserWithRole[] =>
    p.users
      .filter((u) => !HIDDEN_EMAILS.has(u.email))
      .map((u) => ({ ...u, roleSortValue: getRoleSortValue(u) }));

  const columns: TableColumn<ProjectUserWithRole>[] = [
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
            <span class={`text-sm ${!hasPermissions(user) ? "text-neutral" : ""}`}>
              {getPermissionSummary(user)}
            </span>
          }
        >
          <span class="text-primary">{t3({ en: "Instance administrator", fr: "Administrateur d'instance" })}</span>
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
          {t3(TC.edit)}
        </Button>
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
            return {
              success: false as const,
              err: data.error || "Backup failed",
            };
          }

          return { success: true as const };
        },
        silentFetch: async () => {
          refetchBackups();
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
      <div class="mb-3 flex items-center justify-between">
        <div class="text-neutral text-sm">
          {backupsList.loading
            ? ""
            : `${backupsList()?.length || 0} ${t3({ en: "backup(s) available", fr: "sauvegarde(s) disponible(s)" })}`}
        </div>
        <div class="flex gap-2">
          <Button onClick={attemptCreateBackup} size="sm">
            {t3({ en: "Create backup", fr: "Créer une sauvegarde" })}
          </Button>
          <Button onClick={attemptRestoreBackup} size="sm">
            {t3({ en: "Restore from file", fr: "Restaurer depuis un fichier" })}
          </Button>
          <Button
            onClick={() => refetchBackups()}
            iconName="refresh"
            size="sm"
            outline
          >
            {t3({ en: "Refresh", fr: "Actualiser" })}
          </Button>
        </div>
      </div>
      <Show
        when={!backupsList.loading}
        fallback={<div>{t3({ en: "Loading backups...", fr: "Chargement des sauvegardes..." })}</div>}
      >
        <Show
          when={backupsList() && backupsList()!.length > 0}
          fallback={
            <div class="text-neutral">
              {t3({ en: "No backups available for this project", fr: "Aucune sauvegarde disponible pour ce projet" })}
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
                          {group.isCustom ? t3({ en: "Custom Backups", fr: "Sauvegardes personnalisées" }) : group.date}
                        </span>
                        <span class="text-neutral text-sm">
                          ({group.backups.length} {t3({ en: "backup", fr: "sauvegarde" })}
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
      </Show>
    </div>
  );
}
