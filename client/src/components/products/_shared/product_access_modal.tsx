import {
  type APIResponseNoData,
  canUseScope,
  type ProductAccess,
  type ProductDefaultAccess,
  type ProductGrant,
  type ProductGrantLevel,
  type ProductTeamGrant,
  type ScopeId,
  t3,
  type Team,
  type UserDirectoryEntry,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  createFormAction,
  Field,
  ModalContainer,
  Select,
  type SelectOption,
  SelectSearch,
} from "panther";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { canOwnProduct } from "~/state/instance/product_access";
import { instanceState, productById } from "~/state/instance/t1_store";
import { teamMembers } from "~/state/instance/teams";
import { descendantIds } from "./folder_tree";

// The entry that opens the access dialog, in the product menu and both
// editors' File menus: never "Share…", which already means email a PDF.
export const manageAccessLabel = () =>
  t3({
    en: "Manage access…",
    fr: "Gérer l'accès…",
    pt: "Gerir o acesso…",
  });

// "Manage access…" for one product, and its bulk mode, "Set access for
// everything in this folder…", for a global admin. One list holds people and
// teams, and one search box adds either. A team's grant reaches every member
// for as long as they are in the team, so the dialog shows who that is and
// how many of them lack the product's scope. The dialog cannot produce the
// server's refusals: it never offers the owner as a grantee, offers only
// roster users and existing teams, and lists each person and team once.
type Props =
  | { mode: "product"; productId: string }
  | { mode: "folder"; folderId: string };

export function ProductAccessModal(
  p: AlertComponentProps<Props, true | undefined>,
) {
  return (
    <Show
      when={p.mode === "product" ? p.productId : undefined}
      keyed
      fallback={
        <Show when={p.mode === "folder" ? p.folderId : undefined} keyed>
          {(folderId) => (
            <FolderAccessForm
              folderId={folderId}
              close={() => p.close(undefined)}
              done={() => p.close(true)}
            />
          )}
        </Show>
      }
    >
      {(productId) => (
        <ProductAccessForm
          productId={productId}
          close={() => p.close(undefined)}
          done={() => p.close(true)}
        />
      )}
    </Show>
  );
}

// What the server does on a transfer: the previous owner, if any,
// becomes an edit grantee and the new owner's grant goes. Applied to the draft
// when an owner is picked, and to the stored access to know whether the draft
// asks for more than the transfer itself.
function withOwner(access: ProductAccess, owner: string): ProductAccess {
  const previous = access.owner;
  const kept = access.grants.filter((g) =>
    g.email !== owner && g.email !== previous
  );
  return {
    owner,
    defaultAccess: access.defaultAccess,
    grants: previous === null || previous === owner
      ? kept
      : [...kept, { email: previous, level: "edit" }],
    teamGrants: access.teamGrants,
  };
}

function sameAccess(a: ProductAccess, b: ProductAccess): boolean {
  const key = (grants: ProductGrant[]) =>
    grants.map((g) => `${g.email}:${g.level}`).sort().join("\n");
  const teamKey = (grants: ProductTeamGrant[]) =>
    grants.map((g) => `${g.teamId}:${g.level}`).sort().join("\n");
  return a.owner === b.owner && a.defaultAccess === b.defaultAccess &&
    key(a.grants) === key(b.grants) &&
    teamKey(a.teamGrants) === teamKey(b.teamGrants);
}

function userByEmail(email: string): UserDirectoryEntry | undefined {
  return instanceState.users.find((u) => u.email === email);
}

function personLabel(
  email: string,
  user: UserDirectoryEntry | undefined,
): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name ? `${name} (${email})` : email;
}

// A grant to a restricted user who lacks the product's scope is accepted and
// stays inert until their scope access changes, so the dialog says so.
function lacksScope(
  user: UserDirectoryEntry | undefined,
  scopeId: ScopeId | undefined,
): boolean {
  if (user === undefined || user.scopeAccess.all) return false;
  return scopeId === undefined || !canUseScope(user.scopeAccess, scopeId);
}

const lacksScopeLabel = (bulk: boolean) =>
  bulk
    ? t3({
      en: "Only reaches products in their scopes",
      fr: "N'accède qu'aux produits de ses portées",
      pt: "Só acede aos produtos dos seus âmbitos",
    })
    : t3({
      en: "No access to this product's scope",
      fr: "Aucun accès à la portée de ce produit",
      pt: "Sem acesso ao âmbito deste produto",
    });

// A grantee who lacks the scope is offered with a mark; an owner must hold it
// (the server's PRODUCT_OWNER_LACKS_SCOPE), so the owner picker leaves such a
// user out.
function candidateOptions(
  exclude: Set<string>,
  scopeId: ScopeId | undefined,
  bulk: boolean,
  forOwner: boolean,
): SelectOption<string>[] {
  return instanceState.users
    .filter((u) =>
      !exclude.has(u.email) &&
      (forOwner ? !lacksScope(u, scopeId) : !u.isGlobalAdmin)
    )
    .map((u) => {
      const label = personLabel(u.email, u);
      return {
        value: u.email,
        label: lacksScope(u, scopeId)
          ? `${label} · ${lacksScopeLabel(bulk)}`
          : label,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

const anyoneCanViewLabel = () =>
  t3({
    en: "Anyone in this instance can view",
    fr: "Tout le monde dans cette instance peut consulter",
    pt: "Qualquer pessoa nesta instância pode ver",
  });

const anyoneCanEditLabel = () =>
  t3({
    en: "Anyone in this instance can edit",
    fr: "Tout le monde dans cette instance peut modifier",
    pt: "Qualquer pessoa nesta instância pode editar",
  });

const generalAccessLabel = () =>
  t3({ en: "General access", fr: "Accès général", pt: "Acesso geral" });

const peopleLabel = () =>
  t3({
    en: "People and teams with access",
    fr: "Personnes et équipes ayant accès",
    pt: "Pessoas e equipas com acesso",
  });

const addPersonOrTeamLabel = () =>
  t3({
    en: "Add a person or team…",
    fr: "Ajouter une personne ou une équipe…",
    pt: "Adicionar uma pessoa ou uma equipa…",
  });

const membersLabel = (count: number) =>
  count === 1 ? t3({ en: "1 member", fr: "1 membre", pt: "1 membro" }) : t3({
    en: `${count} members`,
    fr: `${count} membres`,
    pt: `${count} membros`,
  });

// The one search box's values: a team id or an email, told apart by prefix.
const TEAM_PREFIX = "team:";
const PERSON_PREFIX = "person:";

// Teams first, each with its size, then people.
function teamOptions(exclude: Set<string>): SelectOption<string>[] {
  return instanceState.teams
    .filter((team) => !exclude.has(team.id))
    .map((team) => ({
      value: `${TEAM_PREFIX}${team.id}`,
      label: `${
        t3({ en: "Team", fr: "Équipe", pt: "Equipa" })
      }: ${team.label} · ${membersLabel(teamMembers(team.id).length)}`,
    }));
}

function prefixed(options: SelectOption<string>[]): SelectOption<string>[] {
  return options.map((o) => ({
    value: `${PERSON_PREFIX}${o.value}`,
    label: o.label,
  }));
}

// A stored grant can name a team deleted since the dialog opened; only the
// teams that still exist are shown and saved.
function existingTeamGrants(grants: ProductTeamGrant[]): ProductTeamGrant[] {
  const known = new Set(instanceState.teams.map((team) => team.id));
  return grants.filter((g) => known.has(g.teamId));
}

// The teams in the list that give a person more than their own grant: the
// highest level wins, so their row says where the higher level comes from.
function teamsRaising(
  grant: ProductGrant,
  teamGrants: ProductTeamGrant[],
): Team[] {
  if (grant.level === "edit") return [];
  const teamIds = userByEmail(grant.email)?.teamIds ?? [];
  const raising = new Set(
    teamGrants
      .filter((g) => g.level === "edit" && teamIds.includes(g.teamId))
      .map((g) => g.teamId),
  );
  return instanceState.teams.filter((team) => raising.has(team.id));
}

const saveLabel = () => t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" });

const levelOptions = (): SelectOption<ProductGrantLevel>[] => [
  {
    value: "view",
    label: t3({ en: "Can view", fr: "Peut consulter", pt: "Pode ver" }),
  },
  {
    value: "edit",
    label: t3({ en: "Can edit", fr: "Peut modifier", pt: "Pode editar" }),
  },
];

// One person in a list: their name, the scope mark, then the row's controls.
function PersonRow(p: {
  email: string;
  scopeId: ScopeId | undefined;
  bulk: boolean;
  // The teams in the list that give this person edit while their own grant
  // is view.
  raisedBy?: Team[];
  children: JSX.Element;
}) {
  const user = () => userByEmail(p.email);
  return (
    <div class="ui-gap-sm ui-pad-sm flex items-center border-b last:border-b-0">
      <div class="min-w-0 flex-1">
        <div class="truncate">{personLabel(p.email, user())}</div>
        <Show when={lacksScope(user(), p.scopeId)}>
          <div class="text-base-content-muted text-xs">
            {lacksScopeLabel(p.bulk)}
          </div>
        </Show>
        <Show when={(p.raisedBy ?? []).length > 0}>
          <div class="text-base-content-muted text-xs">
            {t3({
              en: "Can edit through",
              fr: "Peut modifier via",
              pt: "Pode editar através de",
            })} {(p.raisedBy ?? []).map((team) => team.label).join(", ")}
          </div>
        </Show>
      </div>
      {p.children}
    </div>
  );
}

// One team in the list: its name and size, how many members the grant does
// not reach, the row's controls, and the members on demand.
function TeamRow(p: {
  team: Team;
  scopeId: ScopeId | undefined;
  bulk: boolean;
  children: JSX.Element;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const members = createMemo(() =>
    [...teamMembers(p.team.id)].sort((a, b) =>
      personLabel(a.email, a).localeCompare(personLabel(b.email, b))
    )
  );
  const lacking = () =>
    members().filter((user) => lacksScope(user, p.scopeId)).length;
  return (
    <div class="border-b last:border-b-0">
      <div class="ui-gap-sm ui-pad-sm flex items-center">
        <Button
          size="sm"
          outline
          iconName={expanded() ? "chevronDown" : "chevronRight"}
          ariaLabel={t3({
            en: "Show the team's members",
            fr: "Afficher les membres de l'équipe",
            pt: "Mostrar os membros da equipa",
          })}
          onClick={() => setExpanded(!expanded())}
        />
        <div class="min-w-0 flex-1">
          <div class="truncate">
            {t3({ en: "Team", fr: "Équipe", pt: "Equipa" })}: {p.team.label}
          </div>
          <div class="text-base-content-muted text-xs">
            {membersLabel(members().length)}
            <Show when={lacking() > 0}>
              {" · "}
              {p.bulk
                ? t3({
                  en: `${lacking()} only reach products in their scopes`,
                  fr:
                    `${lacking()} n'accèdent qu'aux produits de leurs portées`,
                  pt: `${lacking()} só acedem aos produtos dos seus âmbitos`,
                })
                : t3({
                  en:
                    `${lacking()} of ${members().length} lack this product's scope`,
                  fr:
                    `${lacking()} sur ${members().length} n'ont pas la portée de ce produit`,
                  pt:
                    `${lacking()} de ${members().length} não têm o âmbito deste produto`,
                })}
            </Show>
          </div>
        </div>
        {p.children}
      </div>
      <Show when={expanded()}>
        <div class="ui-pad-sm border-t">
          <Show
            when={members().length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No one is in this team yet.",
                  fr: "Personne ne fait encore partie de cette équipe.",
                  pt: "Ainda ninguém faz parte desta equipa.",
                })}
              </div>
            }
          >
            <For each={members()}>
              {(user) => (
                <div class="text-sm">
                  {personLabel(user.email, user)}
                  <Show when={user.isGlobalAdmin}>
                    <span class="text-base-content-muted">
                      {" · "}
                      {t3({
                        en: "Administrator",
                        fr: "Administrateur",
                        pt: "Administrador",
                      })}
                    </span>
                  </Show>
                  <Show when={lacksScope(user, p.scopeId)}>
                    <span class="text-base-content-muted">
                      {" · "}
                      {lacksScopeLabel(p.bulk)}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function TeamGrantRows(p: {
  teamGrants: ProductTeamGrant[];
  scopeId: ScopeId | undefined;
  bulk: boolean;
  onLevel: (teamId: string, level: ProductGrantLevel) => void;
  onRemove: (teamId: string) => void;
}) {
  const teamOf = (teamId: string) =>
    instanceState.teams.find((team) => team.id === teamId);
  return (
    <For each={p.teamGrants}>
      {(grant) => (
        <Show when={teamOf(grant.teamId)} keyed>
          {(team) => (
            <TeamRow team={team} scopeId={p.scopeId} bulk={p.bulk}>
              <Select
                size="sm"
                options={levelOptions()}
                value={grant.level}
                onChange={(level) => p.onLevel(grant.teamId, level)}
              />
              <Button
                size="sm"
                outline
                iconName="x"
                ariaLabel={t3({
                  en: "Remove access",
                  fr: "Retirer l'accès",
                  pt: "Remover o acesso",
                })}
                onClick={() => p.onRemove(grant.teamId)}
              />
            </TeamRow>
          )}
        </Show>
      )}
    </For>
  );
}

function setTeamLevel(
  grants: ProductTeamGrant[],
  teamId: string,
  level: ProductGrantLevel,
): ProductTeamGrant[] {
  return grants.map((g) => (g.teamId === teamId ? { teamId, level } : g));
}

function GrantRows(p: {
  grants: ProductGrant[];
  // The teams in the list, which may give a person more than their own grant.
  teamGrants: ProductTeamGrant[];
  scopeId: ScopeId | undefined;
  bulk: boolean;
  onLevel: (email: string, level: ProductGrantLevel) => void;
  onRemove?: (email: string) => void;
}) {
  return (
    <For each={p.grants}>
      {(grant) => (
        <PersonRow
          email={grant.email}
          scopeId={p.scopeId}
          bulk={p.bulk}
          raisedBy={teamsRaising(grant, p.teamGrants)}
        >
          <Select
            size="sm"
            options={levelOptions()}
            value={grant.level}
            onChange={(level) => p.onLevel(grant.email, level)}
          />
          <Show when={p.onRemove}>
            {(onRemove) => (
              <Button
                size="sm"
                outline
                iconName="x"
                ariaLabel={t3({
                  en: "Remove access",
                  fr: "Retirer l'accès",
                  pt: "Remover o acesso",
                })}
                onClick={() => onRemove()(grant.email)}
              />
            )}
          </Show>
        </PersonRow>
      )}
    </For>
  );
}

function setLevel(
  grants: ProductGrant[],
  email: string,
  level: ProductGrantLevel,
): ProductGrant[] {
  return grants.map((g) => (g.email === email ? { email, level } : g));
}

function ProductAccessForm(p: {
  productId: string;
  close: () => void;
  done: () => void;
}) {
  const product = () => productById(p.productId);
  const stored: ProductAccess = {
    owner: product()?.owner ?? null,
    defaultAccess: product()?.defaultAccess ?? "none",
    grants: product()?.grants ?? [],
    teamGrants: existingTeamGrants(product()?.teamGrants ?? []),
  };
  const [tempOwner, setTempOwner] = createSignal(stored.owner);
  const [tempDefaultAccess, setTempDefaultAccess] = createSignal<
    ProductDefaultAccess
  >(stored.defaultAccess);
  const [tempGrants, setTempGrants] = createSignal<ProductGrant[]>(
    stored.grants,
  );
  const [tempTeamGrants, setTempTeamGrants] = createSignal<
    ProductTeamGrant[]
  >(stored.teamGrants);
  const [choosingOwner, setChoosingOwner] = createSignal(false);

  const scopeId = () => product()?.scopeId;
  const draft = (): ProductAccess => ({
    owner: tempOwner(),
    defaultAccess: tempDefaultAccess(),
    grants: tempGrants(),
    teamGrants: existingTeamGrants(tempTeamGrants()),
  });

  function add(value: string) {
    if (value.startsWith(TEAM_PREFIX)) {
      setTempTeamGrants([
        ...tempTeamGrants(),
        { teamId: value.slice(TEAM_PREFIX.length), level: "view" },
      ]);
    } else {
      setTempGrants([
        ...tempGrants(),
        { email: value.slice(PERSON_PREFIX.length), level: "view" },
      ]);
    }
  }

  function pickOwner(email: string) {
    const next = withOwner(draft(), email);
    setTempOwner(next.owner);
    setTempGrants(next.grants);
    setChoosingOwner(false);
  }

  const ownerOptions = createMemo(() =>
    candidateOptions(
      new Set(tempOwner() === null ? [] : [tempOwner()!]),
      scopeId(),
      false,
      true,
    )
  );
  const addOptions = createMemo(() => [
    ...teamOptions(new Set(tempTeamGrants().map((g) => g.teamId))),
    ...prefixed(
      candidateOptions(
        new Set([
          ...(tempOwner() === null ? [] : [tempOwner()!]),
          ...tempGrants().map((g) => g.email),
        ]),
        scopeId(),
        false,
        false,
      ),
    ),
  ]);

  const save = createFormAction(
    async (): Promise<APIResponseNoData> => {
      const owner = tempOwner();
      const transfers = owner !== null && owner !== stored.owner;
      if (transfers) {
        const res = await serverActions.setProductOwner({
          product_id: p.productId,
          email: owner,
        });
        if (!res.success) return res;
      }
      const afterTransfer = transfers ? withOwner(stored, owner) : stored;
      if (!sameAccess(draft(), afterTransfer)) {
        const res = await serverActions.setProductAccess({
          product_id: p.productId,
          defaultAccess: tempDefaultAccess(),
          grants: tempGrants(),
          teamGrants: existingTeamGrants(tempTeamGrants()),
        });
        if (!res.success) return res;
      }
      return { success: true };
    },
    () => p.done(),
  );

  const defaultAccessOptions = (): SelectOption<ProductDefaultAccess>[] => [
    {
      value: "none",
      label: t3({ en: "Restricted", fr: "Restreint", pt: "Restrito" }),
    },
    { value: "view", label: anyoneCanViewLabel() },
    { value: "edit", label: anyoneCanEditLabel() },
  ];

  return (
    <ModalContainer
      title={t3({
        en: "Manage access",
        fr: "Gérer l'accès",
        pt: "Gerir o acesso",
      })}
      subtitle={product()?.label}
      width="md"
      onCancel={p.close}
      actions={[{
        label: saveLabel(),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <Select
            label={generalAccessLabel()}
            options={defaultAccessOptions()}
            value={tempDefaultAccess()}
            onChange={setTempDefaultAccess}
            fullWidth
          />
          <div class="text-base-content-muted text-sm">
            {tempDefaultAccess() === "none"
              ? t3({
                en:
                  "Only the owner, the people and teams below and administrators can open it.",
                fr:
                  "Seuls le propriétaire, les personnes et équipes ci-dessous et les administrateurs peuvent l'ouvrir.",
                pt:
                  "Apenas o proprietário, as pessoas e equipas abaixo e os administradores podem abri-lo.",
              })
              : t3({
                en:
                  "Everyone in this instance has at least this access. A person or team below can be given more, never less.",
                fr:
                  "Tout le monde dans cette instance a au moins cet accès. Une personne ou une équipe ci-dessous peut en recevoir plus, jamais moins.",
                pt:
                  "Todas as pessoas nesta instância têm pelo menos este acesso. Uma pessoa ou equipa abaixo pode receber mais, nunca menos.",
              })}
          </div>
        </div>
        <Field label={peopleLabel()} fullWidth>
          <div class="rounded border">
            <Show
              when={tempOwner()}
              fallback={
                <div class="ui-gap-sm ui-pad-sm flex items-center border-b">
                  <div class="text-base-content-muted flex-1">
                    {t3({
                      en: "No owner",
                      fr: "Aucun propriétaire",
                      pt: "Sem proprietário",
                    })}
                  </div>
                  <Show when={canOwnProduct(p.productId) && !choosingOwner()}>
                    <Button
                      size="sm"
                      outline
                      onClick={() => setChoosingOwner(true)}
                    >
                      {t3({
                        en: "Set owner…",
                        fr: "Définir le propriétaire…",
                        pt: "Definir o proprietário…",
                      })}
                    </Button>
                  </Show>
                </div>
              }
            >
              {(owner) => (
                <PersonRow email={owner()} scopeId={scopeId()} bulk={false}>
                  <span class="text-base-content-muted text-sm">
                    {t3({
                      en: "Owner",
                      fr: "Propriétaire",
                      pt: "Proprietário",
                    })}
                  </span>
                  <Show
                    when={canOwnProduct(p.productId) && !choosingOwner() &&
                      tempOwner() === stored.owner}
                  >
                    <Button
                      size="sm"
                      outline
                      onClick={() =>
                        setChoosingOwner(true)}
                    >
                      {t3({
                        en: "Transfer ownership…",
                        fr: "Transférer la propriété…",
                        pt: "Transferir a propriedade…",
                      })}
                    </Button>
                  </Show>
                </PersonRow>
              )}
            </Show>
            <Show when={choosingOwner()}>
              <div class="ui-spy-sm ui-pad-sm border-b">
                <SelectSearch
                  value={undefined}
                  options={ownerOptions()}
                  onChange={pickOwner}
                  placeholder={t3({
                    en: "Choose the new owner…",
                    fr: "Choisir le nouveau propriétaire…",
                    pt: "Escolher o novo proprietário…",
                  })}
                  fullWidth
                />
                <div class="text-base-content-muted text-xs">
                  {t3({
                    en:
                      "Ownership moves when you save. The previous owner keeps edit access.",
                    fr:
                      "La propriété est transférée à l'enregistrement. L'ancien propriétaire garde l'accès en modification.",
                    pt:
                      "A propriedade é transferida ao guardar. O proprietário anterior mantém o acesso de edição.",
                  })}
                </div>
              </div>
            </Show>
            <div class="ui-pad-sm text-base-content-muted border-b">
              {t3({
                en: "Administrators: full access",
                fr: "Administrateurs : accès complet",
                pt: "Administradores: acesso total",
              })}
            </div>
            <TeamGrantRows
              teamGrants={tempTeamGrants()}
              scopeId={scopeId()}
              bulk={false}
              onLevel={(teamId, level) =>
                setTempTeamGrants(
                  setTeamLevel(tempTeamGrants(), teamId, level),
                )}
              onRemove={(teamId) =>
                setTempTeamGrants(
                  tempTeamGrants().filter((g) => g.teamId !== teamId),
                )}
            />
            <GrantRows
              grants={tempGrants()}
              teamGrants={tempTeamGrants()}
              scopeId={scopeId()}
              bulk={false}
              onLevel={(email, level) =>
                setTempGrants(setLevel(tempGrants(), email, level))}
              onRemove={(email) =>
                setTempGrants(tempGrants().filter((g) => g.email !== email))}
            />
          </div>
        </Field>
        <SelectSearch
          value={undefined}
          options={addOptions()}
          onChange={add}
          placeholder={addPersonOrTeamLabel()}
          fullWidth
        />
        <Show when={tempTeamGrants().length > 0}>
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "A team's access reaches everyone in the team, including people who join it later. A person always has the highest access any row gives them.",
              fr:
                "L'accès d'une équipe vaut pour tous ses membres, y compris ceux qui la rejoignent plus tard. Une personne a toujours l'accès le plus élevé que lui donne une ligne.",
              pt:
                "O acesso de uma equipa abrange todos os seus membros, incluindo quem entrar mais tarde. Uma pessoa tem sempre o acesso mais elevado que alguma linha lhe dá.",
            })}
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}

function FolderAccessForm(p: {
  folderId: string;
  close: () => void;
  done: () => void;
}) {
  const [tempDefaultAccess, setTempDefaultAccess] = createSignal<
    ProductDefaultAccess
  >("none");
  const [tempGrants, setTempGrants] = createSignal<ProductGrant[]>([]);
  const [tempTeamGrants, setTempTeamGrants] = createSignal<
    ProductTeamGrant[]
  >([]);

  function add(value: string) {
    if (value.startsWith(TEAM_PREFIX)) {
      setTempTeamGrants([
        ...tempTeamGrants(),
        { teamId: value.slice(TEAM_PREFIX.length), level: "view" },
      ]);
    } else {
      setTempGrants([
        ...tempGrants(),
        { email: value.slice(PERSON_PREFIX.length), level: "view" },
      ]);
    }
  }

  const folder = () => instanceState.folders.find((f) => f.id === p.folderId);
  const productCount = createMemo(() => {
    const inside = descendantIds(instanceState.folders, p.folderId);
    inside.add(p.folderId);
    return instanceState.products.filter((product) =>
      product.folderId !== null && inside.has(product.folderId)
    ).length;
  });

  const addOptions = createMemo(() => [
    ...teamOptions(new Set(tempTeamGrants().map((g) => g.teamId))),
    ...prefixed(
      candidateOptions(
        new Set(tempGrants().map((g) => g.email)),
        undefined,
        true,
        false,
      ),
    ),
  ]);

  const nothingChosen = () =>
    tempDefaultAccess() === "none" && tempGrants().length === 0 &&
    existingTeamGrants(tempTeamGrants()).length === 0;

  const save = createFormAction(
    async (): Promise<APIResponseNoData> => {
      const res = await serverActions.setFolderProductsAccess({
        folder_id: p.folderId,
        defaultAccess: tempDefaultAccess(),
        grants: tempGrants(),
        teamGrants: existingTeamGrants(tempTeamGrants()),
      });
      if (!res.success) return res;
      return { success: true };
    },
    () => p.done(),
  );

  const defaultAccessOptions = (): SelectOption<ProductDefaultAccess>[] => [
    {
      value: "none",
      label: t3({
        en: "Leave as is",
        fr: "Laisser tel quel",
        pt: "Deixar como está",
      }),
    },
    { value: "view", label: anyoneCanViewLabel() },
    { value: "edit", label: anyoneCanEditLabel() },
  ];

  return (
    <ModalContainer
      title={t3({
        en: "Set access for everything in this folder",
        fr: "Définir l'accès pour tout le contenu de ce dossier",
        pt: "Definir o acesso para todo o conteúdo desta pasta",
      })}
      subtitle={folder()?.label}
      width="md"
      onCancel={p.close}
      actions={[{
        label: saveLabel(),
        onClick: save.click,
        state: save.state(),
        disabled: nothingChosen(),
      }]}
    >
      <div class="ui-spy">
        <div class="text-sm">
          {t3({
            en:
              `This changes the ${productCount()} product(s) in this folder and its subfolders now. It only raises access: nothing is lowered or removed, each product's owner stays its owner, and products added to the folder later are not changed. A team added here keeps its access on these products as its members change.`,
            fr:
              `Cela modifie dès maintenant les ${productCount()} produit(s) de ce dossier et de ses sous-dossiers. L'accès est seulement élevé : rien n'est abaissé ni retiré, chaque produit garde son propriétaire, et les produits ajoutés plus tard au dossier ne sont pas modifiés. Une équipe ajoutée ici garde son accès à ces produits lorsque ses membres changent.`,
            pt:
              `Isto altera agora os ${productCount()} produto(s) desta pasta e das suas subpastas. O acesso só é aumentado: nada é reduzido nem removido, cada produto mantém o seu proprietário, e os produtos adicionados mais tarde à pasta não são alterados. Uma equipa adicionada aqui mantém o acesso a estes produtos quando os seus membros mudam.`,
          })}
        </div>
        <Select
          label={generalAccessLabel()}
          options={defaultAccessOptions()}
          value={tempDefaultAccess()}
          onChange={setTempDefaultAccess}
          fullWidth
        />
        <Field label={peopleLabel()} fullWidth>
          <Show
            when={tempGrants().length > 0 || tempTeamGrants().length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No one added",
                  fr: "Personne n'a été ajouté",
                  pt: "Ninguém adicionado",
                })}
              </div>
            }
          >
            <div class="rounded border">
              <TeamGrantRows
                teamGrants={tempTeamGrants()}
                scopeId={undefined}
                bulk
                onLevel={(teamId, level) =>
                  setTempTeamGrants(
                    setTeamLevel(tempTeamGrants(), teamId, level),
                  )}
                onRemove={(teamId) =>
                  setTempTeamGrants(
                    tempTeamGrants().filter((g) => g.teamId !== teamId),
                  )}
              />
              <GrantRows
                grants={tempGrants()}
                teamGrants={[]}
                scopeId={undefined}
                bulk
                onLevel={(email, level) =>
                  setTempGrants(setLevel(tempGrants(), email, level))}
              />
            </div>
          </Show>
        </Field>
        <SelectSearch
          value={undefined}
          options={addOptions()}
          onChange={add}
          placeholder={addPersonOrTeamLabel()}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
