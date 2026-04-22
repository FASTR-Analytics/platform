import { H_USERS, t3, TC, USER_PERMISSIONS, INSTANCE_PERMISSION_LABELS, type UserPermission } from "lib";
import {
  Button,
  Csv,
  FrameTop,
  HeadingBarMainRibbon,
  downloadCsv,
  openAlert,
  openComponent,
  timActionButton,
  timActionDelete,
  timQuery,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { AddUserForm } from "./add_users";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
import { BulkEditPermissionsForm } from "./bulk_edit_permissions_form";
import { BulkEditDefaultProjectPermissionsForm } from "./bulk_edit_default_project_permissions_form.tsx";
import { User } from "./user";
import { Table, TableColumn, BulkAction } from "panther";
import { serverActions } from "~/server_actions";
import type { UserLog } from "lib";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  thisLoggedInUserEmail: string;
};

export function InstanceUsers(p: Props) {
  const userLogs = timQuery(() => serverActions.getAllUserLogs({}));

  const [selectedUser, setSelectedUser] = createSignal<string | undefined>(
    undefined,
  );
  const [showHUsers, setShowHUsers] = createSignal(false);

  const currentUserIsHUser = () => H_USERS.includes(p.thisLoggedInUserEmail);

  async function attemptAddUser() {
    await openComponent({
      element: AddUserForm,
      props: {},
    });
  }

  async function attemptBatchUploadUsers() {
    await openComponent({
      element: BatchUploadUsersForm,
      props: {},
    });
  }

  async function showCommingSoon() {
    const _res = await openAlert({
      text: t3({
        en: "This functionality is coming soon. For now, click on the 'edit' button for individual users.",
        fr: "Cette fonctionnalité sera bientôt disponible. Pour l'instant, cliquez sur le bouton « modifier » pour chaque utilisateur.",
      }),
    });
    return true;
  }

  function downloadUsersCSV() {
    const csv = new Csv({
      colHeaders: ["email", "is_global_admin"],
      aoa: instanceState.users.map((user) => [
        user.email,
        String(user.isGlobalAdmin),
      ]),
    });
    const today = new Date()
      .toISOString()
      .split("T")[0]
      .replace(/-/g, "_");
    const filename = `users_export_${today}.csv`;
    downloadCsv(csv.stringify(), filename);
  }

  return (
    <Switch>
      <Match
        when={instanceState.users.find(
          (u) => u.email === selectedUser(),
        )}
        keyed
      >
        {(keyedUser) => {
          return (
            <User
              user={keyedUser}
              thisLoggedInUserEmail={p.thisLoggedInUserEmail}
              close={() => setSelectedUser(undefined)}
              projects={instanceState.projects}
            />
          );
        }}
      </Match>
      <Match when={true}>
        <FrameTop
          panelChildren={
            <HeadingBarMainRibbon
              heading={t3({ en: "Users", fr: "Utilisateurs" })}
            >
              <div class="ui-gap-sm flex items-center">
                <Show when={currentUserIsHUser()}>
                  <Button
                    onClick={() => setShowHUsers((v) => !v)}
                    iconName={showHUsers() ? "eyeOff" : "eye"}
                    intent="base-100"
                  >
                    {showHUsers()
                      ? t3({ en: "Hide system users", fr: "Masquer les utilisateurs système" })
                      : t3({ en: "Show system users", fr: "Afficher les utilisateurs système" })}
                  </Button>
                </Show>
                <Button onClick={downloadUsersCSV} iconName="download">
                  {t3({
                    en: "Download users",
                    fr: "Télécharger les utilisateurs",
                  })}
                </Button>
                <Button
                  onClick={attemptBatchUploadUsers}
                  iconName="upload"
                >
                  {t3({
                    en: "Batch import from CSV",
                    fr: "Importation groupée depuis CSV",
                  })}
                </Button>
                <Button onClick={attemptAddUser} iconName="plus">
                  {t3({
                    en: "Add users",
                    fr: "Ajouter des utilisateurs",
                  })}
                </Button>
              </div>
            </HeadingBarMainRibbon>
          }
        >
          <div class="ui-pad flex h-full w-full flex-col gap-4">
            <div class="min-h-0 flex-1">
                <UserTable
                users={instanceState.users}
                logs={(() => { const s = userLogs.state(); return s.status === "ready" ? s.data : undefined; })()}
                onUserClick={(user) => setSelectedUser(user.email)}
                showCommingSoon={showCommingSoon}
                showHUsers={showHUsers}
              />
            </div>
          </div>
        </FrameTop>
      </Match>
    </Switch>
  );
}

type UserData = {
  email: string;
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
} & Record<UserPermission, boolean>;

function hasGlobalPermissions(user: UserData): boolean {
  return USER_PERMISSIONS.some((k) => user[k]);
}

function getGlobalPermissionSummary(user: UserData): string {
  const active = USER_PERMISSIONS.filter((k) => user[k]);
  if (active.length === 0)
    return t3({ en: "No special permissions", fr: "Aucune permission spéciale" });
  const shown = active
    .slice(0, 5)
    .map((k) => t3(INSTANCE_PERMISSION_LABELS[k]))
    .join(", ");
  if (active.length > 5)
    return `${shown}, +${active.length - 5} ${t3({ en: "more", fr: "de plus" })}`;
  return shown;
}

type UserTableData = UserData & {
  lastActiveTs: number;
};

function formatTimeAgo(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    return t3({ en: "Unknown", fr: "Inconnu" });
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t3({ en: "Just now", fr: "À l'instant" });
  if (diffMins < 60)
    return t3({ en: `${diffMins}m ago`, fr: `il y a ${diffMins}m` });
  if (diffHours < 24)
    return t3({ en: `${diffHours}h ago`, fr: `il y a ${diffHours}h` });
  if (diffDays < 30)
    return t3({ en: `${diffDays}d ago`, fr: `il y a ${diffDays}j` });
  return date.toLocaleDateString();
}

function UserTable(p: {
  users: UserData[];
  logs: UserLog[] | undefined;
  onUserClick: (user: UserData) => void;
  showCommingSoon: () => Promise<boolean>;
  showHUsers: () => boolean;
}) {
  const userRows = (): UserTableData[] => {
    const map = new Map<string, number>();
    for (const log of p.logs ?? []) {
      try {
        const logDate = new Date(log.timestamp);
        if (isNaN(logDate.getTime())) continue;
        const ts = logDate.getTime();
        const existing = map.get(log.user_email);
        if (!existing || ts > existing) {
          map.set(log.user_email, ts);
        }
      } catch {
        // skip invalid log entries
      }
    }
    return p.users
      .filter((user) => p.showHUsers() || !H_USERS.includes(user.email))
      .map((user) => ({
        ...user,
        lastActiveTs: map.get(user.email) ?? -1,
      }));
  };

  const columns: TableColumn<UserTableData>[] = [
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
      key: "lastActiveTs",
      header: t3({ en: "Last active", fr: "Dernière activité" }),
      sortable: true,
      render: (user) => {
        if (user.lastActiveTs === -1) {
          return (
            <span class="text-neutral text-sm">
              {p.logs === undefined ? "..." : t3({ en: "Never", fr: "Jamais" })}
            </span>
          );
        }
        return (
          <span class="text-sm">
            {formatTimeAgo(new Date(user.lastActiveTs))}
          </span>
        );
      },
    },
    {
      key: "isGlobalAdmin",
      header: t3({ en: "Status", fr: "Statut" }),
      sortable: true,
      render: (user) => (
        <Show
          when={user.isGlobalAdmin}
          fallback={
            <span
              class={`text-sm ${!hasGlobalPermissions(user) ? "text-neutral" : ""}`}
            >
              {getGlobalPermissionSummary(user)}
            </span>
          }
        >
          <span class="text-primary text-sm">
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
        <div class="flex justify-end gap-1">
          <Button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              p.onUserClick(user);
            }}
            intent="base-100"
            iconName="pencil"
          />
        </div>
      ),
    },
  ];

  const bulkMakeAdmin = timActionButton(
    async (selectedUsers: UserTableData[]) => {
      const emails = selectedUsers.map((u) => u.email);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: true });
    },
  );

  const bulkMakeNonAdmin = timActionButton(
    async (selectedUsers: UserTableData[]) => {
      const emails = selectedUsers.map((u) => u.email);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: false });
    },
  );

  async function handleBulkRemoveUsers(selectedUsers: UserTableData[]) {
    const emails = selectedUsers.map((u) => u.email);
    const userCount = emails.length;
    const userText =
      userCount === 1
        ? t3({ en: "this user", fr: "cet utilisateur" })
        : t3({ en: "these users", fr: "ces utilisateurs" });

    const deleteAction = timActionDelete(
      {
        text: t3({
          en: `Are you sure you want to remove ${userText}?`,
          fr: `Êtes-vous sûr de vouloir supprimer ${userText} ?`,
        }),
        itemList: emails,
      },
      () => serverActions.deleteUser({ emails }),
    );

    await deleteAction.click();
  }

  async function handleBulkEditPermissions(selectedUsers: UserTableData[]) {
    const emails = selectedUsers.map((u) => u.email);
    await openComponent({
      element: BulkEditPermissionsForm,
      props: { emails },
    });
  }

  async function handleBulkEditDefaultProjectPermissions(
    selectedUsers: UserTableData[],
  ) {
    const emails = selectedUsers.map((u) => u.email);
    await openComponent({
      element: BulkEditDefaultProjectPermissionsForm,
      props: { emails },
    });
  }

  function handleBulkDownloadCSV(selectedUsers: UserTableData[]) {
    const csv = new Csv({
      colHeaders: ["email", "is_global_admin"],
      aoa: selectedUsers.map((user) => [
        user.email,
        String(user.isGlobalAdmin),
      ]),
    });
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "_");
    const filename = `selected_users_export_${today}.csv`;
    downloadCsv(csv.stringify(), filename);
  }

  const canConfigureUsers =
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_users;

  const bulkActions: BulkAction<UserTableData>[] = [
    ...(canConfigureUsers ? [
      {
        label: t3({ en: "Make admin", fr: "Attribuer le rôle d'administrateur" }),
        intent: "primary" as const,
        onClick: bulkMakeAdmin.click,
        state: bulkMakeAdmin.state,
        outline: true,
      },
      {
        label: t3({
          en: "Make non-admin",
          fr: "Retirer le rôle d'administrateur",
        }),
        intent: "primary" as const,
        onClick: bulkMakeNonAdmin.click,
        state: bulkMakeNonAdmin.state,
        outline: true,
      },
      {
        label: t3({ en: "Edit permissions", fr: "Modifier les droits d'accès" }),
        intent: "primary" as const,
        outline: true,
        onClick: handleBulkEditPermissions,
      },
      {
        label: t3({
          en: "Edit default project permissions",
          fr: "Modifier les permissions de projet par défaut",
        }),
        intent: "primary" as const,
        outline: true,
        onClick: handleBulkEditDefaultProjectPermissions,
      },
    ] : []),
    {
      label: t3({ en: "Download users", fr: "Télécharger les utilisateurs" }),
      intent: "primary",
      outline: true,
      onClick: handleBulkDownloadCSV,
    },
    ...(canConfigureUsers ? [
      {
        label: t3({ en: "Remove", fr: "Supprimer" }),
        intent: "danger" as const,
        outline: true,
        onClick: handleBulkRemoveUsers,
      },
    ] : []),
  ];

  return (
    <Table
      data={userRows()}
      columns={columns}
      defaultSort={{ key: "lastActiveTs", direction: "desc" }}
      keyField="email"
      noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur" })}
      bulkActions={bulkActions}
      selectionLabel={t3({ en: "user", fr: "utilisateur" })}
      fitTableToAvailableHeight
    />
  );
}
