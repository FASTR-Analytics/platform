import {
  isRosterRow,
  type ProductGrantLevel,
  type ProductSummary,
  t3,
  TC,
  type Team,
} from "lib";
import {
  Button,
  Card,
  createButtonAction,
  createDeleteAction,
  EditorComponentProps,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  Input,
  type ListEntry,
  openConfirm,
  SelectList,
  type SelectOption,
  SelectSearch,
} from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { serverActions } from "~/server_actions";
import { isGlobalAdmin, isHUser } from "~/state/instance/permissions";
import { instanceState } from "~/state/instance/t1_store";
import { personLabel, teamMembers } from "~/state/instance/teams";
import { pendingSubPageOpen, setPendingSubPageOpen } from "~/state/t4_ui";
import {
  administratorFullAccessLabel,
  deleteTeamText,
  joiningGivesAccessText,
  memberCountText,
  productCountText,
  teamsLabel,
} from "./team_text";

// The Teams editor, opened from the Users tab by a holder of
// can_configure_users (the guard on every team route): the teams on the left,
// the selected team on the right. A team is a draft until Save: the name and
// description are overrides over the stored row, and the members are two
// lists, added and removed, over the roster's live membership, so a change
// another manager makes meanwhile is kept rather than overwritten. Saving a
// draft that adds people to a team products already grant a level says what
// those people gain first.
type Props = EditorComponentProps<Record<never, never>, undefined>;

// The draft of a team that does not exist yet.
const NEW_TEAM = "new";

export function TeamsEditor(p: Props) {
  holdCopilotView();
  copilotViewController.setView("teams");
  // A tour replay opened this page: the request is spent once the view is set.
  if (pendingSubPageOpen() === "teams") setPendingSubPageOpen(null);

  const [selectedId, setSelectedId] = createSignal<string | undefined>(
    instanceState.teams.at(0)?.id,
  );
  // undefined = not edited, so the field shows the stored value.
  const [tempLabel, setTempLabel] = createSignal<string | undefined>();
  const [tempDescription, setTempDescription] = createSignal<
    string | undefined
  >();
  const [tempAdded, setTempAdded] = createSignal<string[]>([]);
  const [tempRemoved, setTempRemoved] = createSignal<string[]>([]);

  const creating = () => selectedId() === NEW_TEAM;
  const selectedTeam = (): Team | undefined =>
    instanceState.teams.find((team) => team.id === selectedId());

  const storedLabel = () => selectedTeam()?.label ?? "";
  const storedDescription = () => selectedTeam()?.description ?? "";
  const label = () => tempLabel() ?? storedLabel();
  const description = () => tempDescription() ?? storedDescription();

  const liveEmails = createMemo(() => {
    const team = selectedTeam();
    return team === undefined ? [] : teamMembers(team.id).map((u) => u.email);
  });
  // Only what the roster does not already show: a person someone else added
  // meanwhile is no longer an addition.
  const pendingAdded = createMemo(() => {
    const live = new Set(liveEmails());
    return tempAdded().filter((email) => !live.has(email));
  });
  const pendingRemoved = createMemo(() => {
    const live = new Set(liveEmails());
    return tempRemoved().filter((email) => live.has(email));
  });
  const memberEmails = createMemo(() => {
    const removed = new Set(pendingRemoved());
    return [
      ...liveEmails().filter((email) => !removed.has(email)),
      ...pendingAdded(),
    ].sort((a, b) => personLabel(a).localeCompare(personLabel(b)));
  });

  const needsSaving = () =>
    creating() ||
    label().trim() !== storedLabel() ||
    description().trim() !== storedDescription() ||
    pendingAdded().length > 0 || pendingRemoved().length > 0;

  function resetDraft() {
    setTempLabel(undefined);
    setTempDescription(undefined);
    setTempAdded([]);
    setTempRemoved([]);
  }

  // Leaving a draft with unsaved changes asks first.
  async function mayLeaveDraft(): Promise<boolean> {
    if (selectedId() === undefined || !needsSaving()) return true;
    return await openConfirm({
      text: t3({
        en: "Discard the unsaved changes to this team?",
        fr: "Abandonner les modifications non enregistrées de cette équipe ?",
        pt: "Rejeitar as alterações não guardadas desta equipa?",
      }),
      confirmButtonLabel: t3({
        en: "Discard",
        fr: "Abandonner",
        pt: "Rejeitar",
      }),
    });
  }

  async function select(id: string | undefined) {
    if (id === selectedId()) return;
    if (!(await mayLeaveDraft())) return;
    resetDraft();
    setSelectedId(id);
  }

  async function attemptClose() {
    if (await mayLeaveDraft()) p.close(undefined);
  }

  function discard() {
    resetDraft();
    if (creating()) setSelectedId(instanceState.teams.at(0)?.id);
  }

  const create = createButtonAction(
    () =>
      serverActions.createTeam({
        label: label(),
        description: description().trim() || null,
        memberEmails: memberEmails(),
      }),
    (data) => {
      resetDraft();
      setSelectedId(data.teamId);
    },
  );

  const update = createButtonAction(
    (teamId: string) =>
      serverActions.updateTeam({
        team_id: teamId,
        label: label(),
        description: description().trim() || null,
        memberEmails: memberEmails(),
      }),
    () => resetDraft(),
  );

  async function save() {
    if (label().trim() === "") return;
    const team = selectedTeam();
    if (team === undefined) {
      await create.click();
      return;
    }
    const joining = pendingAdded().length;
    if (joining > 0 && team.productCount > 0) {
      const confirmed = await openConfirm({
        text: joiningGivesAccessText(joining, team.productCount),
        confirmButtonLabel: t3(TC.save),
      });
      if (!confirmed) return;
    }
    await update.click(team.id);
  }

  async function attemptDelete(team: Team) {
    const deleteAction = createDeleteAction(
      deleteTeamText(team.label, liveEmails().length, team.productCount),
      () => serverActions.deleteTeam({ team_id: team.id }),
      () => {
        resetDraft();
        setSelectedId(
          instanceState.teams.find((other) => other.id !== team.id)?.id,
        );
      },
    );
    await deleteAction.click();
  }

  const items = createMemo((): ListEntry<string>[] => [
    ...(creating()
      ? [{
        id: NEW_TEAM,
        label: t3({ en: "New team", fr: "Nouvelle équipe", pt: "Nova equipa" }),
      }]
      : []),
    ...instanceState.teams.map((team) => ({
      id: team.id,
      label: team.label,
    })),
  ]);

  // A caller who is not a global admin cannot add themselves (the server's
  // TEAM_SELF_ADD_REFUSED), so they are not offered. Operators are offered
  // only to an operator, as the users table shows them.
  const personOptions = createMemo((): SelectOption<string>[] => {
    const taken = new Set(memberEmails());
    return instanceState.users
      .filter((user) =>
        !taken.has(user.email) &&
        (isGlobalAdmin() || user.email !== instanceState.currentUserEmail) &&
        (isHUser() || !isRosterRow(user) || !user.isHUser)
      )
      .map((user) => ({
        value: user.email,
        label: personLabel(user.email),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  function addMember(email: string) {
    if (tempRemoved().includes(email)) {
      setTempRemoved(tempRemoved().filter((e) => e !== email));
    } else {
      setTempAdded([...tempAdded(), email]);
    }
  }

  function removeMember(email: string) {
    if (tempAdded().includes(email)) {
      setTempAdded(tempAdded().filter((e) => e !== email));
    } else {
      setTempRemoved([...tempRemoved(), email]);
    }
  }

  const saving = () =>
    create.state().status === "loading" || update.state().status === "loading";

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          data-tour="teams-header"
          onBack={needsSaving() && selectedId() !== undefined
            ? undefined
            : attemptClose}
          leftChildren={needsSaving() && selectedId() !== undefined
            ? (
              <div class="ui-gap-sm flex items-center">
                <Button
                  intent="success"
                  iconName="save"
                  onClick={save}
                  disabled={label().trim() === ""}
                  state={saving() ? { status: "loading" } : undefined}
                >
                  {t3(TC.save)}
                </Button>
                <Button outline iconName="x" onClick={discard}>
                  {t3(TC.cancel)}
                </Button>
              </div>
            )
            : undefined}
          heading={teamsLabel()}
        >
          <Button
            data-tour="teams-new"
            iconName="plus"
            onClick={() => select(NEW_TEAM)}
            disabled={creating()}
          >
            {t3({ en: "New team", fr: "Nouvelle équipe", pt: "Nova equipa" })}
          </Button>
        </HeadingBar>
      }
    >
      <FrameLeftResizable
        startingWidth={300}
        minWidth={150}
        maxWidth={400}
        panelPad="md"
        pad="md"
        spy="md"
        panelChildren={
          <div data-tour="teams-list">
            <SelectList
              items={items()}
              value={selectedId()}
              onChange={select}
              fullWidth
              emptyMessage={t3({
                en: "No teams yet",
                fr: "Aucune équipe pour l'instant",
                pt: "Ainda não existem equipas",
              })}
              renderItem={(item) => (
                <div class="ui-gap-sm flex items-center justify-between">
                  <span class="truncate">{item.label}</span>
                  <Show when={item.id !== NEW_TEAM}>
                    <span class="ui-text-caption shrink-0">
                      {memberCountText(teamMembers(item.id).length)}
                    </span>
                  </Show>
                </div>
              )}
            />
          </div>
        }
      >
        <Show
          when={creating() || selectedTeam() !== undefined}
          fallback={
            <div class="text-base-content-muted max-w-3xl text-sm">
              {t3({
                en:
                  "A team is a group of people. Give a team access to a product and everyone in it has that access, including people who join later. Create a team to begin.",
                fr:
                  "Une équipe est un groupe de personnes. Donnez à une équipe l'accès à un produit et tous ses membres y ont accès, y compris ceux qui la rejoignent plus tard. Créez une équipe pour commencer.",
                pt:
                  "Uma equipa é um grupo de pessoas. Dê a uma equipa acesso a um produto e todos os seus membros têm esse acesso, incluindo quem entrar mais tarde. Crie uma equipa para começar.",
              })}
            </div>
          }
        >
          <div class="ui-spy-sm max-w-3xl" data-tour="teams-details">
            <Input
              label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
              value={label()}
              onChange={setTempLabel}
              fullWidth
            />
            <Input
              label={t3({
                en: "Description (optional)",
                fr: "Description (facultative)",
                pt: "Descrição (opcional)",
              })}
              value={description()}
              onChange={setTempDescription}
              fullWidth
            />
          </div>
          <div class="max-w-3xl" data-tour="teams-members">
            <Card
              header={`${
                t3({ en: "Members", fr: "Membres", pt: "Membros" })
              } (${memberEmails().length})`}
            >
              <div class="ui-spy-sm">
                <Show
                  when={memberEmails().length > 0}
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
                  <div class="rounded border">
                    <For each={memberEmails()}>
                      {(email) => (
                        <MemberRow
                          email={email}
                          unsaved={pendingAdded().includes(email)}
                          onRemove={() => removeMember(email)}
                        />
                      )}
                    </For>
                  </div>
                </Show>
                <SelectSearch
                  value={undefined}
                  options={personOptions()}
                  onChange={addMember}
                  placeholder={t3({
                    en: "Add a person…",
                    fr: "Ajouter une personne…",
                    pt: "Adicionar uma pessoa…",
                  })}
                  fullWidth
                />
                <Show when={pendingRemoved().length > 0}>
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en:
                        "People you removed lose the access this team gives when you save, even in a document they have open.",
                      fr:
                        "Les personnes retirées perdent l'accès donné par cette équipe à l'enregistrement, même dans un document ouvert.",
                      pt:
                        "As pessoas removidas perdem o acesso dado por esta equipa ao guardar, mesmo num documento aberto.",
                    })}
                  </div>
                </Show>
              </div>
            </Card>
          </div>
          <Show when={selectedTeam()} keyed>
            {(team) => (
              <>
                <div class="max-w-3xl" data-tour="teams-products">
                  <TeamProductsCard team={team} />
                </div>
                <div>
                  <Button
                    outline
                    intent="danger"
                    iconName="trash"
                    onClick={() => attemptDelete(team)}
                  >
                    {t3({
                      en: "Delete team",
                      fr: "Supprimer l'équipe",
                      pt: "Eliminar equipa",
                    })}
                  </Button>
                </div>
              </>
            )}
          </Show>
        </Show>
      </FrameLeftResizable>
    </FrameTop>
  );
}

function MemberRow(p: {
  email: string;
  unsaved: boolean;
  onRemove: () => void;
}) {
  const user = () => instanceState.users.find((u) => u.email === p.email);
  return (
    <div class="ui-gap-sm ui-pad-sm flex items-center border-b last:border-b-0">
      <div class="min-w-0 flex-1">
        <div class="truncate">{personLabel(p.email)}</div>
        <Show when={user()?.isGlobalAdmin}>
          <div class="text-base-content-muted text-xs">
            {administratorFullAccessLabel()}
          </div>
        </Show>
        <Show when={p.unsaved}>
          <div class="text-base-content-muted text-xs">
            {t3({
              en: "Added when you save",
              fr: "Ajouté à l'enregistrement",
              pt: "Adicionado ao guardar",
            })}
          </div>
        </Show>
      </div>
      <Button
        size="sm"
        outline
        iconName="x"
        ariaLabel={t3({
          en: "Remove from team",
          fr: "Retirer de l'équipe",
          pt: "Remover da equipa",
        })}
        onClick={p.onRemove}
      />
    </div>
  );
}

const LEVEL_LABELS: Record<ProductGrantLevel, () => string> = {
  view: () => t3({ en: "Can view", fr: "Peut consulter", pt: "Pode ver" }),
  edit: () => t3({ en: "Can edit", fr: "Peut modifier", pt: "Pode editar" }),
};

// What the team can open. A product's title reaches only a connection that
// can see the product, so the list names those and counts the rest: the
// team's own count is of every product in the instance.
function TeamProductsCard(p: { team: Team }) {
  const levelOf = (product: ProductSummary) =>
    product.teamGrants.find((g) => g.teamId === p.team.id)?.level;
  const visible = createMemo(() =>
    instanceState.products
      .filter((product) => levelOf(product) !== undefined)
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  const hiddenCount = () => Math.max(0, p.team.productCount - visible().length);

  return (
    <Card
      header={`${
        t3({
          en: "Products this team can access",
          fr: "Produits accessibles à cette équipe",
          pt: "Produtos a que esta equipa tem acesso",
        })
      } (${p.team.productCount})`}
    >
      <div class="ui-spy-sm">
        <Show when={visible().length > 0}>
          <div class="rounded border">
            <For each={visible()}>
              {(product) => (
                <div class="ui-gap-sm ui-pad-sm flex items-center border-b last:border-b-0">
                  <div class="min-w-0 flex-1 truncate">{product.label}</div>
                  <Show when={levelOf(product)} keyed>
                    {(level) => (
                      <span class="text-base-content-muted flex-none text-sm">
                        {LEVEL_LABELS[level]()}
                      </span>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={hiddenCount() > 0}>
          <div class="text-base-content-muted text-sm">
            {visible().length > 0
              ? t3({
                en: `And ${
                  productCountText(hiddenCount())
                } more that you do not have access to.`,
                fr: `Et ${
                  productCountText(hiddenCount())
                } de plus auxquels vous n'avez pas accès.`,
                pt: `E mais ${
                  productCountText(hiddenCount())
                } a que não tem acesso.`,
              })
              : t3({
                en: `${
                  productCountText(hiddenCount())
                } that you do not have access to.`,
                fr: `${
                  productCountText(hiddenCount())
                } auxquels vous n'avez pas accès.`,
                pt: `${productCountText(hiddenCount())} a que não tem acesso.`,
              })}
          </div>
        </Show>
        <div class="text-base-content-muted text-sm">
          {p.team.productCount === 0
            ? t3({
              en:
                'No product gives this team access yet. Open a product\'s "Manage access" and add the team there.',
              fr:
                "Aucun produit ne donne encore accès à cette équipe. Ouvrez « Gérer l'accès » d'un produit et ajoutez-y l'équipe.",
              pt:
                'Ainda nenhum produto dá acesso a esta equipa. Abra "Gerir o acesso" de um produto e adicione aí a equipa.',
            })
            : t3({
              en:
                "A team's access to a product is changed in that product's \"Manage access\".",
              fr:
                "L'accès d'une équipe à un produit se modifie dans « Gérer l'accès » de ce produit.",
              pt:
                'O acesso de uma equipa a um produto altera-se em "Gerir o acesso" desse produto.',
            })}
        </div>
      </div>
    </Card>
  );
}
