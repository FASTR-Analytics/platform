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
  Csv,
  downloadCsv,
  FrameTop,
  openAlert,
  openComponent,
  plural,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Show,
  untrack,
} from "solid-js";
import { AddUserForm } from "./add_user_form";
import { BatchUploadUsersForm } from "./batch_upload_users_form";
import { BulkEditPermissionsForm } from "./bulk_edit_permissions_form";
import { BulkEditScopesForm } from "./bulk_edit_scopes_form";
import { AddToTeamForm } from "./add_to_team_form";
import { teamsLabel } from "./team_text";
import { TeamsEditor } from "./teams";
import { User } from "./user";
import { BulkAction, createTableConfig, Table, TableColumn } from "panther";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { teamLabelsOf } from "~/state/instance/teams";
import {
  openShellEditor,
  pendingSubPageOpen,
  setPendingSubPageOpen,
} from "~/state/t4_ui";
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

  async function openTeams(): Promise<void> {
    await openShellEditor({
      element: TeamsEditor,
      props: {},
    });
  }

  // A tour replay into Teams: open it; the editor clears the request once its
  // view is set.
  createEffect(() => {
    const request = pendingSubPageOpen();
    if (request !== "teams") return;
    if (!canCallRoute("createTeam")) {
      setPendingSubPageOpen(null);
      return;
    }
    untrack(() => void openTeams());
  });

  function downloadUsersCSV() {
    const csv = new Csv({
      colHeaders: USERS_CSV_HEADERS,
      aoa: visibleUsers().map(userCsvRow),
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
                <Show when={canCallRoute("createTeam")}>
                  <Button
                    data-tour="instance-users-teams"
                    onClick={openTeams}
                    iconName="users"
                    outline
                  >
                    {teamsLabel()}
                  </Button>
                </Show>
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

// A user's teams by name, in the team list's own order (alphabetical).
function getTeamLabels(user: OtherUser): string[] {
  return teamLabelsOf(user.teamIds);
}

const noTeamLabel = () =>
  t3({ en: "No team", fr: "Aucune équipe", pt: "Sem equipa" });

// The users export: one row per user, the teams separated by semicolons, since
// a team's name may hold a comma.
const USERS_CSV_HEADERS = ["email", "is_global_admin", "teams"];

function userCsvRow(user: OtherUser): string[] {
  return [
    user.email,
    String(user.isGlobalAdmin),
    getTeamLabels(user).join("; "),
  ];
}

function formatTimeAgo(date: Date): string {
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
  onUserClick: (user: OtherUser) => void;
  toolbarChildren: JSX.Element;
}) {
  const usersTable = createTableConfig({
    sort: { key: "lastActiveAt", direction: "desc" },
  });

  const columns = createMemo((): TableColumn<OtherUser>[] => [
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
      key: "lastActiveAt",
      header: t3({
        en: "Last active",
        fr: "Dernière activité",
        pt: "Última atividade",
      }),
      sortable: true,
      sortDescFirst: true,
      searchable: false,
      render: (user) =>
        user.lastActiveAt === null
          ? (
            <span class="text-base-content-muted">
              {t3({ en: "Never", fr: "Jamais", pt: "Nunca" })}
            </span>
          )
          : <span>{formatTimeAgo(new Date(user.lastActiveAt))}</span>,
    },
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
    // Sorted by the names as shown, so users group by their first team; a
    // user in no team has no sort value and comes last either way. The filter
    // takes each team as its own value, so one team's filter keeps every
    // member whatever else they are in.
    {
      key: "teamIds",
      header: teamsLabel(),
      sortable: true,
      sortValue: (user) => {
        const labels = getTeamLabels(user);
        return labels.length === 0 ? undefined : labels.join(", ");
      },
      filterable: true,
      filterValue: (user) => {
        const labels = getTeamLabels(user);
        return labels.length === 0 ? [noTeamLabel()] : labels;
      },
      searchValue: (user) => getTeamLabels(user).join(" "),
      render: (user) => {
        const labels = getTeamLabels(user);
        return labels.length === 0
          ? <span class="text-base-content-muted">—</span>
          : <span>{labels.join(", ")}</span>;
      },
    },
  ]);

  // toggleUserAdmin refuses any batch that names the caller, so their own
  // row is never sent.
  const bulkMakeAdmin = createButtonAction(
    async (selectedUsers: OtherUser[]) => {
      const emails = selectedUsers
        .map((u) => u.email)
        .filter((email) => email !== instanceState.currentUserEmail);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: true });
    },
  );

  // An admin cannot demote themselves, so their own row is never sent.
  const bulkMakeNonAdmin = createButtonAction(
    async (selectedUsers: OtherUser[]) => {
      const emails = selectedUsers
        .map((u) => u.email)
        .filter((email) => email !== instanceState.currentUserEmail);
      return serverActions.toggleUserAdmin({ emails, makeAdmin: false });
    },
  );

  // The rows the user-management rule lets the caller name: never their own,
  // and no admin's unless the caller is an admin.
  const manageable = (selectedUsers: OtherUser[]) =>
    selectedUsers.filter((u) =>
      u.email !== instanceState.currentUserEmail &&
      (isGlobalAdmin() || !u.isGlobalAdmin)
    );

  async function handleBulkRemoveUsers(selectedUsers: OtherUser[]) {
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
  async function handleBulkEditScopes(selectedUsers: OtherUser[]) {
    const admins = selectedUsers.filter((u) => u.isGlobalAdmin);
    const emails = manageable(selectedUsers)
      .filter((u) => !u.isGlobalAdmin)
      .map((u) => u.email);
    await openComponent({
      element: BulkEditScopesForm,
      props: { emails, skippedAdmins: admins.length },
    });
  }

  async function handleBulkEditPermissions(selectedUsers: OtherUser[]) {
    const emails = manageable(selectedUsers).map((u) => u.email);
    if (emails.length === 0) return;
    await openComponent({
      element: BulkEditPermissionsForm,
      props: { emails },
    });
  }

  // A caller who is not a global admin cannot add themselves to a team, so
  // their own row is left out and counted.
  async function handleBulkAddToTeam(selectedUsers: OtherUser[]) {
    const skipSelf = !isGlobalAdmin() &&
      selectedUsers.some((u) => u.email === instanceState.currentUserEmail);
    const emails = selectedUsers
      .map((u) => u.email)
      .filter((email) =>
        isGlobalAdmin() || email !== instanceState.currentUserEmail
      );
    await openComponent({
      element: AddToTeamForm,
      props: { emails, skippedSelf: skipSelf },
    });
  }

  function handleBulkDownloadCSV(selectedUsers: OtherUser[]) {
    const csv = new Csv({
      colHeaders: USERS_CSV_HEADERS,
      aoa: selectedUsers.map(userCsvRow),
    });
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "_");
    const filename = `selected_users_export_${today}.csv`;
    downloadCsv(csv.stringify(), filename);
  }

  // Each bulk action renders only for a caller its route admits.
  const bulkActions = createMemo<BulkAction<OtherUser>[]>(() => [
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
    ...(canCallRoute("addTeamMembers")
      ? [{
        label: t3({
          en: "Add to team",
          fr: "Ajouter à une équipe",
          pt: "Adicionar a uma equipa",
        }),
        intent: "primary" as const,
        outline: true,
        onClick: handleBulkAddToTeam,
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
      data={p.users}
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
