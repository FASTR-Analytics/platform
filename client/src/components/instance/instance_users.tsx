import { InstanceDetail, t3, TC } from "lib";
import {
  Button,
  Csv,
  FrameTop,
  HeadingBarMainRibbon,
  StateHolderWrapper,
  TimQuery,
  downloadCsv,
  openAlert,
  openComponent,
  openConfirm,
  timActionButton,
  timActionDelete,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createSignal,
  createResource,
  Suspense,
} from "solid-js";
import { AddUserForm } from "./add_users";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
import { BulkEditPermissionsForm } from "./bulk_edit_permissions_form";
import { BulkEditDefaultProjectPermissionsForm } from "./bulk_edit_default_project_permissions_form.tsx";
import { User } from "./user";
import { Table, TableColumn, BulkAction } from "panther";
import { serverActions } from "~/server_actions";
import type { UserLog } from "lib";

type Props = {
  thisLoggedInUserEmail: string;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceUsers(p: Props) {
  // Temp state
  const [userLogs] = createResource(() => serverActions.getAllUserLogs({}));

  const [selectedUser, setSelectedUser] = createSignal<string | undefined>(
    undefined,
  );
  const [logFilterUser, setLogFilterUser] = createSignal<string | undefined>(
    undefined,
  );

  // Actions

  async function attemptAddUser() {
    await openComponent({
      element: AddUserForm,
      props: {
        silentFetch: p.instanceDetail.silentFetch,
      },
    });
  }

  async function attemptBatchUploadUsers() {
    await openComponent({
      element: BatchUploadUsersForm,
      props: {
        silentRefreshUsers: p.instanceDetail.silentFetch,
      },
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

  return (
    <StateHolderWrapper state={p.instanceDetail.state()}>
      {(keyedInstanceDetail) => {
        function downloadUsersCSV() {
          const csv = new Csv({
            colHeaders: ["email", "is_global_admin"],
            aoa: keyedInstanceDetail.users.map((user) => [
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
              when={keyedInstanceDetail.users.find(
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
                    silentFetch={p.instanceDetail.silentFetch}
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
                      users={keyedInstanceDetail.users}
                      logs={
                        userLogs.latest?.success ? userLogs.latest.data : []
                      }
                      logsLoading={userLogs.loading}
                      onUserClick={(user) => setSelectedUser(user.email)}
                      onViewLogs={(email) => setLogFilterUser(email)}
                      showCommingSoon={showCommingSoon}
                      silentFetch={p.instanceDetail.silentFetch}
                    />
                  </div>
                  {/* <Suspense fallback={<div class="text-neutral text-sm">{t3({ en: "Loading activity logs...", fr: "Chargement des journaux d'activité..." })}</div>}>
                    <Show when={userLogs.latest?.success ? userLogs.latest.data : undefined} keyed>
                      {(logs: UserLog[]) => (
                        <div class="flex-1 min-h-0">
                          <UserLogsTable
                            logs={logs}
                            filterByUser={logFilterUser()}
                            onFilterByUser={setLogFilterUser}
                          />
                        </div>
                      )}
                    </Show>
                  </Suspense> */}
                </div>
              </FrameTop>
            </Match>
          </Switch>
        );
      }}
    </StateHolderWrapper>
  );
}

type UserData = {
  email: string;
  isGlobalAdmin: boolean;
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
  logs: UserLog[];
  logsLoading: boolean;
  onUserClick: (user: UserData) => void;
  onViewLogs: (email: string) => void;
  showCommingSoon: () => Promise<boolean>;
  silentFetch: () => Promise<void>;
}) {
  const lastActiveByUser = () => {
    const map = new Map<string, Date>();
    for (const log of p.logs) {
      try {
        const existing = map.get(log.user_email);
        const logDate = new Date(log.timestamp);
        if (isNaN(logDate.getTime())) continue;
        if (!existing || logDate > existing) {
          map.set(log.user_email, logDate);
        }
      } catch {
        // Skip invalid log entries
      }
    }
    return map;
  };
  const columns: TableColumn<UserData>[] = [
    {
      key: "email",
      header: t3(TC.email),
      sortable: true,
    },
    {
      key: "last_active",
      header: t3({ en: "Last active", fr: "Dernière activité" }),
      sortable: true,
      render: (user) => {
        if (p.logsLoading) {
          return <span class="text-neutral text-sm">...</span>;
        }
        try {
          const lastActive = lastActiveByUser().get(user.email);
          if (!lastActive)
            return (
              <span class="text-neutral text-sm">
                {t3({ en: "Never", fr: "Jamais" })}
              </span>
            );
          return <span class="text-sm">{formatTimeAgo(lastActive)}</span>;
        } catch {
          return (
            <span class="text-neutral text-sm">
              {t3({ en: "Unknown", fr: "Inconnu" })}
            </span>
          );
        }
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
            <span class="text-neutral text-sm">
              {t3({ en: "User", fr: "Utilisateur" })}
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
      align: "right",
      render: (user) => (
        <div class="flex justify-end gap-1">
          <Button
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              p.onViewLogs(user.email);
            }}
            intent="base-100"
            iconName="document"
          />
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

  const bulkMakeAdmin = timActionButton(async (selectedUsers: UserData[]) => {
    const emails = selectedUsers.map((u) => u.email);
    return serverActions.toggleUserAdmin({ emails, makeAdmin: true });
  }, p.silentFetch);

  const bulkMakeNonAdmin = timActionButton(
    async (selectedUsers: UserData[]) => {
      const emails = selectedUsers.map((u) => u.email);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: false });
    },
    p.silentFetch,
  );

  async function handleBulkRemoveUsers(selectedUsers: UserData[]) {
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
      p.silentFetch,
    );

    await deleteAction.click();
  }

  async function handleBulkEditPermissions(selectedUsers: UserData[]) {
    const emails = selectedUsers.map((u) => u.email);
    await openComponent({
      element: BulkEditPermissionsForm,
      props: { emails, silentFetch: p.silentFetch },
    });
  }

  async function handleBulkEditDefaultProjectPermissions(selectedUsers: UserData[]) {
    const emails = selectedUsers.map((u) => u.email);
    await openComponent({
      element: BulkEditDefaultProjectPermissionsForm,
      props: { emails, silentFetch: p.silentFetch },
    });
  }

  function handleBulkDownloadCSV(selectedUsers: UserData[]) {
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

  const bulkActions: BulkAction<UserData>[] = [
    {
      label: t3({ en: "Make admin", fr: "Attribuer le rôle d'administrateur" }),
      intent: "primary",
      onClick: bulkMakeAdmin.click,
      state: bulkMakeAdmin.state,
      outline: true,
    },
    {
      label: t3({
        en: "Make non-admin",
        fr: "Retirer le rôle d'administrateur",
      }),
      intent: "primary",
      onClick: bulkMakeNonAdmin.click,
      state: bulkMakeNonAdmin.state,
      outline: true,
    },
    {
      label: t3({ en: "Edit permissions", fr: "Modifier les droits d'accès" }),
      intent: "primary",
      outline: true,
      onClick: handleBulkEditPermissions,
    },
    {
      label: t3({ en: "Edit default project permissions", fr: "Modifier les permissions de projet par défaut" }),
      intent: "primary",
      outline: true,
      onClick: handleBulkEditDefaultProjectPermissions,
    },
    {
      label: t3({ en: "Download users", fr: "Télécharger les utilisateurs" }),
      intent: "primary",
      outline: true,
      onClick: handleBulkDownloadCSV,
    },
    {
      label: t3({ en: "Remove", fr: "Supprimer" }),
      intent: "danger",
      outline: true,
      onClick: handleBulkRemoveUsers,
    },
  ];

  return (
    <Table
      data={p.users}
      columns={columns}
      defaultSort={{ key: "email", direction: "asc" }}
      keyField="email"
      noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur" })}
      bulkActions={bulkActions}
      selectionLabel={t3({ en: "user", fr: "utilisateur" })}
      fitTableToAvailableHeight
    />
  );
}

function UserLogsTable(p: {
  logs: UserLog[];
  filterByUser?: string;
  onFilterByUser: (email: string | undefined) => void;
}) {
  const filteredLogs = () => {
    if (!p.filterByUser) return p.logs;
    return p.logs.filter((log) => log.user_email === p.filterByUser);
  };

  const columns: TableColumn<UserLog>[] = [
    {
      key: "timestamp",
      header: t3({ en: "Timestamp", fr: "Horodatage" }),
      sortable: true,
      render: (log) => (
        <span class="text-sm">{new Date(log.timestamp).toLocaleString()}</span>
      ),
    },
    {
      key: "user_email",
      header: t3({ en: "User", fr: "Utilisateur" }),
      sortable: true,
      render: (log) => (
        <button
          class="hover:text-primary cursor-pointer text-left hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            p.onFilterByUser(
              p.filterByUser === log.user_email ? undefined : log.user_email,
            );
          }}
        >
          {log.user_email}
        </button>
      ),
    },
    {
      key: "endpoint",
      header: t3({ en: "Endpoint Accessed", fr: "Point d'accès" }),
      sortable: true,
    },
    {
      key: "endpoint_result",
      header: t3({ en: "Status", fr: "Statut" }),
      sortable: true,
    },
    {
      key: "details",
      header: t3({ en: "Details", fr: "Détails" }),
      render: (log) => (
        <Show when={log.details}>
          <Button
            intent="base-100"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openAlert({
                title: t3({
                  en: "Request Details",
                  fr: "Détails de la requête",
                }),
                text: (
                  <div class="max-h-96 overflow-auto font-mono text-sm whitespace-pre-wrap">
                    {formatJsonDetails(log.details!)}
                  </div>
                ),
              });
            }}
          >
            {t3({ en: "View", fr: "Voir" })}
          </Button>
        </Show>
      ),
    },
  ];

  return (
    <div class="flex h-full flex-col">
      <Show when={p.filterByUser}>
        <div class="mb-2 flex items-center gap-2 text-sm">
          <span class="text-neutral">
            {t3({ en: "Filtering by", fr: "Filtré par" })}:
          </span>
          <span class="font-medium">{p.filterByUser}</span>
          <Button
            size="sm"
            intent="base-100"
            iconName="x"
            onClick={() => p.onFilterByUser(undefined)}
          />
        </div>
      </Show>
      <Table
        data={filteredLogs()}
        columns={columns}
        defaultSort={{ key: "timestamp", direction: "desc" }}
        keyField="id"
        noRowsMessage={t3({ en: "No logs", fr: "Aucun journal" })}
        fitTableToAvailableHeight
      />
    </div>
  );
}

function formatJsonDetails(details: string): string {
  try {
    const parsed = JSON.parse(details);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return details;
  }
}
