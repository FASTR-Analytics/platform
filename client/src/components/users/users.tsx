import {
  INSTANCE_PERMISSION_LABELS,
  isRosterRow,
  OtherUser,
  type ScopeId,
  t3,
  TC,
  USER_PERMISSIONS,
} from "lib";
import {
  Button,
  createButtonAction,
  createDeleteAction,
  createQuery,
  Csv,
  downloadCsv,
  FrameTop,
  openAlert,
  openComponent,
  plural,
} from "panther";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { AddUserForm } from "./add_user_form";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
import { BulkEditPermissionsForm } from "./bulk_edit_permissions_form";
import { BulkEditScopesForm } from "./bulk_edit_scopes_form";
import { User } from "./user";
import { BulkAction, createTableConfig, Table, TableColumn } from "panther";
import { serverActions } from "~/server_actions";
import type { UserLastActive } from "lib";
import { instanceState } from "~/state/instance/t1_store";
import { openShellEditor } from "~/state/t4_ui";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import {
  canCallRoute,
  isGlobalAdmin,
  isHUser,
} from "~/state/instance/permissions";

export function InstanceUsers() {
  holdCopilotView();
  copilotViewController.setView("users");
  // The Last active column exists only for a caller its route admits; the
  // query follows the permission live.
  const lastActiveQuery = createMemo(() =>
    canCallRoute("getUsersLastActive")
      ? createQuery(() => serverActions.getUsersLastActive({}))
      : undefined
  );

  const [showHUsers, setShowHUsers] = createSignal(false);
  // Operators are hidden by default; Download exports what the table shows.
  const visibleUsers = () =>
    instanceState.users.filter(isRosterRow).filter((user) =>
      showHUsers() || !user.isHUser
    );

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

  function downloadUsersCSV() {
    const csv = new Csv({
      colHeaders: ["email", "is_global_admin"],
      aoa: visibleUsers().map((user) => [
        user.email,
        String(user.isGlobalAdmin),
      ]),
    });
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "_");
    const filename = `users_export_${today}.csv`;
    downloadCsv(csv.stringify(), filename);
  }

  return (
    <FrameTop pad="md">
      <div class="flex h-full w-full flex-col gap-4">
        <div class="min-h-0 flex-1" data-tour="instance-users-table">
          <UserTable
            users={visibleUsers()}
            showLastActive={lastActiveQuery() !== undefined}
            lastActive={(() => {
              const s = lastActiveQuery()?.state();
              return s?.status === "ready" ? s.data : undefined;
            })()}
            onUserClick={(user) =>
              void openShellEditor({
                element: User,
                props: { email: user.email },
              })}
            toolbarChildren={
              <div class="ui-gap-sm flex items-center">
                <Show when={isHUser()}>
                  <Button
                    onClick={() => setShowHUsers((v) => !v)}
                    iconName={showHUsers() ? "eyeOff" : "eye"}
                    outline
                  >
                    {showHUsers()
                      ? t3({
                        en: "Hide system users",
                        fr: "Masquer les utilisateurs système",
                        pt: "Ocultar utilizadores do sistema",
                      })
                      : t3({
                        en: "Show system users",
                        fr: "Afficher les utilisateurs système",
                        pt: "Mostrar utilizadores do sistema",
                      })}
                  </Button>
                </Show>
                <div
                  class="ui-gap-sm flex items-center"
                  data-tour="instance-users-bulk"
                >
                  <Button
                    onClick={downloadUsersCSV}
                    iconName="download"
                    outline
                  >
                    {t3({
                      en: "Download",
                      fr: "Télécharger",
                      pt: "Transferir",
                    })}
                  </Button>
                  <Show when={canCallRoute("batchUploadUsers")}>
                    <Button
                      onClick={attemptBatchUploadUsers}
                      iconName="upload"
                      outline
                    >
                      {t3({
                        en: "Batch import",
                        fr: "Importation groupée",
                        pt: "Importação em lote",
                      })}
                    </Button>
                  </Show>
                </div>
                <Show when={canCallRoute("addUsers")}>
                  <Button
                    data-tour="instance-users-add"
                    onClick={attemptAddUser}
                    iconName="plus"
                  >
                    {t3({
                      en: "Add users",
                      fr: "Ajouter des utilisateurs",
                      pt: "Adicionar utilizadores",
                    })}
                  </Button>
                </Show>
              </div>
            }
          />
        </div>
      </div>
    </FrameTop>
  );
}

function hasGlobalPermissions(user: OtherUser): boolean {
  return USER_PERMISSIONS.some((k) => user[k]);
}

function getFullName(user: OtherUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function getStatusLabel(user: OtherUser): string {
  if (user.isContactPerson) {
    return t3({
      en: "Contact person",
      fr: "Personne de contact",
      pt: "Pessoa de contacto",
    });
  }
  if (user.isGlobalAdmin) {
    return t3({
      en: "Instance administrator",
      fr: "Administrateur d'instance",
      pt: "Administrador da instância",
    });
  }
  return getGlobalPermissionSummary(user);
}

function getGlobalPermissionSummary(user: OtherUser): string {
  const active = USER_PERMISSIONS.filter((k) => user[k]);
  if (active.length === 0) {
    return t3({
      en: "No special permissions",
      fr: "Aucune permission spéciale",
      pt: "Sem permissões especiais",
    });
  }
  return summariseLabels(active.map((k) => t3(INSTANCE_PERMISSION_LABELS[k])));
}

function summariseLabels(labels: string[]): string {
  const shown = labels.slice(0, 5).join(", ");
  if (labels.length > 5) {
    return `${shown}, +${labels.length - 5} ${
      t3({
        en: "more",
        fr: "de plus",
        pt: "mais",
      })
    }`;
  }
  return shown;
}

function getScopeLabels(user: OtherUser): string[] {
  if (user.scopeAccess.all) {
    return [];
  }
  const scopeIds: ReadonlySet<ScopeId> = new Set(user.scopeAccess.scopeIds);
  return instanceState.scopes
    .filter((s) => scopeIds.has(s.id))
    .map((s) => s.label);
}

function getScopesLabel(user: OtherUser): string {
  if (user.scopeAccess.all) {
    return t3(TC.allData);
  }
  const labels = getScopeLabels(user);
  if (labels.length === 0) {
    return t3({ en: "No scopes", fr: "Aucune portée", pt: "Nenhum âmbito" });
  }
  return summariseLabels(labels);
}

type UserTableData = OtherUser & {
  lastActiveTs: number;
};

function formatTimeAgo(date: Date): string {
  if (!date || isNaN(date.getTime())) {
    return t3({ en: "Unknown", fr: "Inconnu", pt: "Desconhecido" });
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return t3({ en: "Just now", fr: "À l'instant", pt: "Agora mesmo" });
  }
  if (diffMins < 60) {
    return t3({
      en: `${diffMins}m ago`,
      fr: `il y a ${diffMins}m`,
      pt: `há ${diffMins}m`,
    });
  }
  if (diffHours < 24) {
    return t3({
      en: `${diffHours}h ago`,
      fr: `il y a ${diffHours}h`,
      pt: `há ${diffHours}h`,
    });
  }
  if (diffDays < 30) {
    return t3({
      en: `${diffDays}d ago`,
      fr: `il y a ${diffDays}j`,
      pt: `há ${diffDays}d`,
    });
  }
  return date.toLocaleDateString();
}

function UserTable(p: {
  users: OtherUser[];
  showLastActive: boolean;
  lastActive: UserLastActive[] | undefined;
  onUserClick: (user: OtherUser) => void;
  toolbarChildren: JSX.Element;
}) {
  const usersTable = createTableConfig({
    sort: p.showLastActive
      ? { key: "lastActiveTs", direction: "desc" }
      : { key: "email", direction: "asc" },
  });

  const userRows = (): UserTableData[] => {
    const map = new Map(
      (p.lastActive ?? []).map((
        r,
      ) => [r.email, new Date(r.lastActive).getTime()]),
    );
    return p.users.map((user) => ({
      ...user,
      lastActiveTs: map.get(user.email) ?? -1,
    }));
  };

  const lastActiveColumn: TableColumn<UserTableData> = {
    key: "lastActiveTs",
    header: t3({
      en: "Last active",
      fr: "Dernière activité",
      pt: "Última atividade",
    }),
    sortable: true,
    sortDescFirst: true,
    searchable: false,
    render: (user) => {
      if (user.lastActiveTs === -1) {
        return (
          <span class="text-base-content-muted">
            {p.lastActive === undefined
              ? "..."
              : t3({ en: "Never", fr: "Jamais", pt: "Nunca" })}
          </span>
        );
      }
      return <span>{formatTimeAgo(new Date(user.lastActiveTs))}</span>;
    },
  };

  const columns = createMemo((): TableColumn<UserTableData>[] => [
    {
      key: "firstName",
      header: t3({ en: "Name", fr: "Nom", pt: "Nome" }),
      sortable: true,
      searchValue: getFullName,
      render: (user) => {
        const name = getFullName(user);
        return name
          ? <span>{name}</span>
          : <span class="text-base-content-muted">—</span>;
      },
    },
    {
      key: "email",
      header: t3(TC.email),
      sortable: true,
    },
    {
      key: "organisation",
      header: t3({
        en: "Organisation",
        fr: "Organisation",
        pt: "Organização",
      }),
      sortable: true,
      filterable: true,
      render: (user) =>
        user.organisation
          ? <span>{user.organisation}</span>
          : <span class="text-base-content-muted">—</span>,
    },
    ...(p.showLastActive ? [lastActiveColumn] : []),
    {
      key: "isGlobalAdmin",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      filterable: true,
      filterValue: getStatusLabel,
      render: (user) => (
        <span
          class={user.isContactPerson || user.isGlobalAdmin
            ? "text-primary"
            : hasGlobalPermissions(user)
            ? ""
            : "text-base-content-muted"}
        >
          {getStatusLabel(user)}
        </span>
      ),
    },
    {
      key: "scopeAccess",
      header: t3({ en: "Scopes", fr: "Portées", pt: "Âmbitos" }),
      sortable: true,
      sortValue: getScopesLabel,
      filterable: true,
      filterValue: getScopesLabel,
      render: (user) => (
        <span
          class={!user.scopeAccess.all && getScopeLabels(user).length === 0
            ? "text-base-content-muted"
            : ""}
        >
          {getScopesLabel(user)}
        </span>
      ),
    },
  ]);

  // toggleUserAdmin refuses any batch that names the caller, so their own
  // row is never sent.
  const bulkMakeAdmin = createButtonAction(
    async (selectedUsers: UserTableData[]) => {
      const emails = selectedUsers
        .map((u) => u.email)
        .filter((email) => email !== instanceState.currentUserEmail);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: true });
    },
  );

  // An admin cannot demote themselves, so their own row is never sent.
  const bulkMakeNonAdmin = createButtonAction(
    async (selectedUsers: UserTableData[]) => {
      const emails = selectedUsers
        .map((u) => u.email)
        .filter((email) => email !== instanceState.currentUserEmail);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: false });
    },
  );

  // The rows the user-management rule lets the caller name: never their own,
  // and no admin's unless the caller is an admin.
  const manageable = (selectedUsers: UserTableData[]) =>
    selectedUsers.filter((u) =>
      u.email !== instanceState.currentUserEmail &&
      (isGlobalAdmin() || !u.isGlobalAdmin)
    );

  async function handleBulkRemoveUsers(selectedUsers: UserTableData[]) {
    const emails = manageable(selectedUsers).map((u) => u.email);
    if (emails.length === 0) return;
    const userCount = emails.length;
    const userText = plural(userCount, {
      one: t3({
        en: "this user",
        fr: "cet utilisateur",
        pt: "este utilizador",
      }),
      other: t3({
        en: "these users",
        fr: "ces utilisateurs",
        pt: "estes utilizadores",
      }),
    });

    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: `Are you sure you want to remove ${userText}?`,
          fr: `Êtes-vous sûr de vouloir supprimer ${userText} ?`,
          pt: `Tem a certeza de que pretende remover ${userText}?`,
        }),
        itemList: emails,
      },
      () => serverActions.deleteUser({ emails }),
    );

    await deleteAction.click();
  }

  // Global admins always have every scope (the route refuses their rows),
  // so they are skipped and counted.
  async function handleBulkEditScopes(selectedUsers: UserTableData[]) {
    const admins = selectedUsers.filter((u) => u.isGlobalAdmin);
    const emails = manageable(selectedUsers)
      .filter((u) => !u.isGlobalAdmin)
      .map((u) => u.email);
    await openComponent({
      element: BulkEditScopesForm,
      props: { emails, skippedAdmins: admins.length },
    });
  }

  async function handleBulkEditPermissions(selectedUsers: UserTableData[]) {
    const emails = manageable(selectedUsers).map((u) => u.email);
    if (emails.length === 0) return;
    await openComponent({
      element: BulkEditPermissionsForm,
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

  // Each bulk action renders only for a caller its route admits.
  const bulkActions = createMemo<BulkAction<UserTableData>[]>(() => [
    ...(canCallRoute("toggleUserAdmin")
      ? [
        {
          label: t3({
            en: "Make admin",
            fr: "Attribuer le rôle d'administrateur",
            pt: "Tornar administrador",
          }),
          intent: "primary" as const,
          onClick: bulkMakeAdmin.click,
          state: bulkMakeAdmin.state,
          outline: true,
        },
        {
          label: t3({
            en: "Make non-admin",
            fr: "Retirer le rôle d'administrateur",
            pt: "Remover administrador",
          }),
          intent: "primary" as const,
          onClick: bulkMakeNonAdmin.click,
          state: bulkMakeNonAdmin.state,
          outline: true,
        },
      ]
      : []),
    ...(canCallRoute("bulkUpdateUserPermissions")
      ? [{
        label: t3({
          en: "Edit permissions",
          fr: "Modifier les droits d'accès",
          pt: "Editar permissões",
        }),
        intent: "primary" as const,
        outline: true,
        onClick: handleBulkEditPermissions,
      }]
      : []),
    // Scope access: a holder of the route's flag who is not limited to
    // scopes themselves (the user-management rule refuses a restricted caller).
    ...(canCallRoute("bulkSetUserScopeAccess") &&
        instanceState.currentUserScopeAccess.all
      ? [{
        label: t3({
          en: "Edit scopes",
          fr: "Modifier les portées",
          pt: "Editar âmbitos",
        }),
        intent: "primary" as const,
        outline: true,
        onClick: handleBulkEditScopes,
      }]
      : []),
    {
      label: t3({
        en: "Download users",
        fr: "Télécharger les utilisateurs",
        pt: "Transferir utilizadores",
      }),
      intent: "primary",
      outline: true,
      onClick: handleBulkDownloadCSV,
    },
    ...(canCallRoute("deleteUser")
      ? [
        {
          label: t3({ en: "Remove", fr: "Supprimer", pt: "Remover" }),
          intent: "danger" as const,
          outline: true,
          onClick: handleBulkRemoveUsers,
        },
      ]
      : []),
  ]);

  return (
    <Table
      data={userRows()}
      columns={columns()}
      config={usersTable}
      keyField="email"
      noRowsMessage={t3({
        en: "No users",
        fr: "Aucun utilisateur",
        pt: "Sem utilizadores",
      })}
      onRowClick={p.onUserClick}
      bulkActions={bulkActions()}
      itemLabel={{
        one: t3({ en: "user", fr: "utilisateur", pt: "utilizador" }),
        other: t3({ en: "users", fr: "utilisateurs", pt: "utilizadores" }),
      }}
      toolbar={{ search: true, children: p.toolbarChildren }}
    />
  );
}
