import { InstanceDetail, t, t2, T } from "lib";
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
import { Match, Show, Switch, createSignal, createResource, Suspense } from "solid-js";
import { AddUserForm } from "./add_users";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
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
  const [userLogs] = createResource(
    () => serverActions.getAllUserLogs({})
  );

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
      text: "This functionality is coming soon. For now, click on the 'edit' button for individual users.",
    });
    return true;
  }

  return (
    <StateHolderWrapper state={p.instanceDetail.state()}>
      {(keyedInstanceDetail) => {
        function downloadUsersCSV() {
          const csv = new Csv({
            colHeaders: ["email", "is_global_admin"],
            aoa: keyedInstanceDetail.users.map((user) => [user.email, String(user.isGlobalAdmin)]),
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
                  <HeadingBarMainRibbon heading={t2(T.FRENCH_UI_STRINGS.users)}>
                    <div class="ui-gap-sm flex items-center">
                      <Button onClick={downloadUsersCSV} iconName="download">
                        {t("Download users")}
                      </Button>
                      <Button
                        onClick={attemptBatchUploadUsers}
                        iconName="upload"
                      >
                        {t("Batch import from CSV")}
                      </Button>
                      <Button onClick={attemptAddUser} iconName="plus">
                        {t2(T.FRENCH_UI_STRINGS.add_users)}
                      </Button>
                    </div>
                  </HeadingBarMainRibbon>
                }
              >
                <div class="ui-pad h-full w-full flex flex-col gap-4">
                  <div class="flex-1">
                    <UserTable
                      users={keyedInstanceDetail.users}
                      logs={userLogs.latest?.success ? userLogs.latest.data : []}
                      logsLoading={userLogs.loading}
                      onUserClick={(user) => setSelectedUser(user.email)}
                      onViewLogs={(email) => setLogFilterUser(email)}
                      showCommingSoon={showCommingSoon}
                      silentFetch={p.instanceDetail.silentFetch}
                    />
                  </div>
                  <Suspense fallback={<div class="text-neutral text-sm">Loading activity logs...</div>}>
                    <Show when={userLogs.latest?.success ? userLogs.latest.data : undefined} keyed>
                      {(logs: UserLog[]) => (
                        <div class="flex-1 overflow-auto">
                          <UserLogsTable
                            logs={logs}
                            filterByUser={logFilterUser()}
                            onFilterByUser={setLogFilterUser}
                          />
                        </div>
                      )}
                    </Show>
                  </Suspense>
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
    return t("Unknown");
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("Just now");
  if (diffMins < 60) return t(`${diffMins}m ago`);
  if (diffHours < 24) return t(`${diffHours}h ago`);
  if (diffDays < 30) return t(`${diffDays}d ago`);
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
      header: t2(T.FRENCH_UI_STRINGS.email),
      sortable: true,
    },
    {
      key: "last_active",
      header: t("Last active"),
      sortable: true,
      render: (user) => {
        if (p.logsLoading) {
          return <span class="text-neutral text-sm">...</span>;
        }
        try {
          const lastActive = lastActiveByUser().get(user.email);
          if (!lastActive) return <span class="text-neutral text-sm">{t("Never")}</span>;
          return <span class="text-sm">{formatTimeAgo(lastActive)}</span>;
        } catch {
          return <span class="text-neutral text-sm">{t("Unknown")}</span>;
        }
      },
    },
    {
      key: "isGlobalAdmin",
      header: t("Status"),
      sortable: true,
      render: (user) => (
        <Show
          when={user.isGlobalAdmin}
          fallback={<span class="text-neutral text-sm">{t("User")}</span>}
        >
          <span class="text-primary text-sm">
            {t2(T.Paramètres.instance_admin)}
          </span>
        </Show>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (user) => (
        <div class="flex gap-1 justify-end">
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
    const userText = userCount === 1 ? t("this user") : t("these users");

    const deleteAction = timActionDelete(
      {
        text: t(`Are you sure you want to remove ${userText}?`),
        itemList: emails,
      },
      () => serverActions.deleteUser({ emails }),
      p.silentFetch,
    );

    await deleteAction.click();
  }

  function handleBulkDownloadCSV(selectedUsers: UserData[]) {
    const csv = new Csv({
      colHeaders: ["email", "is_global_admin"],
      aoa: selectedUsers.map((user) => [user.email, String(user.isGlobalAdmin)]),
    });
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "_");
    const filename = `selected_users_export_${today}.csv`;
    downloadCsv(csv.stringify(), filename);
  }

  const bulkActions: BulkAction<UserData>[] = [
    {
      label: t2(T.FRENCH_UI_STRINGS.make_admin),
      intent: "primary",
      onClick: bulkMakeAdmin.click,
      state: bulkMakeAdmin.state,
      outline: true,
    },
    {
      label: t2(T.FRENCH_UI_STRINGS.make_nonadmin),
      intent: "primary",
      onClick: bulkMakeNonAdmin.click,
      state: bulkMakeNonAdmin.state,
      outline: true,
    },
    {
      label: t("Download users"),
      intent: "primary",
      outline: true,
      onClick: handleBulkDownloadCSV,
    },
    {
      label: t("Remove"),
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
      noRowsMessage={t("No users")}
      bulkActions={bulkActions}
      selectionLabel="user"
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
      header: t("Timestamp"),
      sortable: true,
      render: (log) => (
        <span class="text-sm">
          {new Date(log.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      key: "user_email",
      header: t("User"),
      sortable: true,
      render: (log) => (
        <button
          class="text-left hover:underline hover:text-primary cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            p.onFilterByUser(p.filterByUser === log.user_email ? undefined : log.user_email);
          }}
        >
          {log.user_email}
        </button>
      ),
    },
    {
      key: "endpoint",
      header: t("Endpoint Accessed"),
      sortable: true,
    },
    {
      key: "endpoint_result",
      header: t("Status"),
      sortable: true,
    },
    {
      key: "details",
      header: t("Details"),
      render: (log) => (
        <Show when={log.details}>
          <Button
            intent="base-100"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openAlert({
                title: t("Request Details"),
                text: (
                  <div class="whitespace-pre-wrap font-mono text-sm max-h-96 overflow-auto">
                    {formatJsonDetails(log.details!)}
                  </div>
                )
              });
            }}
          >
            {t("View")}
          </Button>
        </Show>
      )
    }
  ];

  return (
    <div class="flex flex-col h-full">
      <Show when={p.filterByUser}>
        <div class="flex items-center gap-2 mb-2 text-sm">
          <span class="text-neutral">{t("Filtering by")}:</span>
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
        noRowsMessage={t("No Logs")}
        fitTableToAvailableHeight
      />
    </div>
  )
}

function formatJsonDetails(details: string): string {
  try {
    const parsed = JSON.parse(details);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return details; 
  }
}
