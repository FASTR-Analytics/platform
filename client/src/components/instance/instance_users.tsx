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
import { Match, Show, Switch, createSignal, createResource } from "solid-js";
import { AddUserForm } from "./add_users";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
import { User } from "./user";
import { Table, TableColumn, BulkAction } from "panther";
import { serverActions } from "~/server_actions";
import { UserLog } from "../../../../server/db/mod.ts";

type Props = {
  thisLoggedInUserEmail: string;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceUsers(p: Props) {
  // Temp state
  const [userLogs] = createResource(() => serverActions.getAllUserLogs());

  const [selectedUser, setSelectedUser] = createSignal<string | undefined>(
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
          const csv = new Csv({ colHeaders: ["email", "is_global_admin"] });
          keyedInstanceDetail.users.forEach((user) => {
            csv.MUTATE_addRow([user.email, String(user.isGlobalAdmin)]);
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
                <div class="ui-pad h-full w-full">
                  <UserTable
                    users={keyedInstanceDetail.users}
                    onUserClick={(user) => setSelectedUser(user.email)}
                    showCommingSoon={showCommingSoon}
                    silentFetch={p.instanceDetail.silentFetch}
                  />
                </div>
                <Show when={userLogs()?.data}>
                  <div class="ui-pad h-full w-full">
                    <UserLogsTable logs={userLogs()!.data}/>
                  </div>
                </Show>
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

function UserTable(p: {
  users: UserData[];
  onUserClick: (user: UserData) => void;
  showCommingSoon: () => Promise<boolean>;
  silentFetch: () => Promise<void>;
}) {
  const columns: TableColumn<UserData>[] = [
    {
      key: "email",
      header: t2(T.FRENCH_UI_STRINGS.email),
      sortable: true,
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
        <Button
          onClick={(e) => {
            e.stopPropagation();
            p.onUserClick(user);
          }}
          intent="base-100"
          // outline
          iconName="pencil"
        />
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
    const csv = new Csv({ colHeaders: ["email", "is_global_admin"] });
    selectedUsers.forEach((user) => {
      csv.MUTATE_addRow([user.email, String(user.isGlobalAdmin)]);
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

function UserLogsTable(p :{
  logs: UserLog[];
}) {
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
          <span clas="text-neutral text-xs truncate max-w-xs" title={log.details}>
            {log.details}
          </span>
        </Show>
      )
    }
  ];

  return (
    <Table
      data={p.logs}
      columns={columns}
      defaultSort={{ key: "timestamp", direction: "desc" }}
      keyField="id"
      noRowsMessage={t("No Logs")}
      fitTableToAvailableHeight
    />
  )
}


