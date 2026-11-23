import { type OtherUser, t3, type Team } from "lib";
import {
  Button,
  Card,
  createButtonAction,
  openConfirm,
  type SelectOption,
  SelectSearch,
} from "panther";
import { createMemo, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { canCallRoute, isGlobalAdmin } from "~/state/instance/permissions";
import { instanceState } from "~/state/instance/t1_store";
import { teamsOf } from "~/state/instance/teams";
import {
  administratorFullAccessLabel,
  joiningGivesAccessText,
  productCountText,
  teamsLabel,
} from "./team_text";

// A user's teams, on their page: every holder of can_view_users reads them,
// and a holder of can_configure_users adds the user to a team or removes them
// from one. Each change is written at once, after saying what it gives or
// takes, since a membership is one fact, not a form. A caller who is not a
// global admin is not offered their own row to add (TEAM_SELF_ADD_REFUSED).
export function UserTeamsCard(p: { user: OtherUser }) {
  const teams = createMemo(() => teamsOf(p.user.teamIds));
  const isSelf = () => p.user.email === instanceState.currentUserEmail;
  const mayAdd = () =>
    canCallRoute("addTeamMembers") && (isGlobalAdmin() || !isSelf());
  const mayRemove = () => canCallRoute("removeTeamMembers");

  const options = createMemo((): SelectOption<string>[] =>
    instanceState.teams
      .filter((team) => !p.user.teamIds.includes(team.id))
      .map((team) => ({ value: team.id, label: team.label }))
  );

  const add = createButtonAction((teamId: string) =>
    serverActions.addTeamMembers({ team_id: teamId, emails: [p.user.email] })
  );
  const remove = createButtonAction((teamId: string) =>
    serverActions.removeTeamMembers({
      team_id: teamId,
      emails: [p.user.email],
    })
  );

  async function attemptAdd(teamId: string) {
    const team = instanceState.teams.find((t) => t.id === teamId);
    if (team === undefined) return;
    if (team.productCount > 0 && !p.user.isGlobalAdmin) {
      const confirmed = await openConfirm({
        text: joiningGivesAccessText(1, team.productCount),
        confirmButtonLabel: t3({
          en: "Add to team",
          fr: "Ajouter à l'équipe",
          pt: "Adicionar à equipa",
        }),
      });
      if (!confirmed) return;
    }
    await add.click(teamId);
  }

  async function attemptRemove(team: Team) {
    const confirmed = await openConfirm({
      text: team.productCount > 0 && !p.user.isGlobalAdmin
        ? t3({
          en:
            `Remove this user from "${team.label}"? They lose the access this team gives to ${
              productCountText(team.productCount)
            }, even in a document they have open.`,
          fr:
            `Retirer cet utilisateur de « ${team.label} » ? Il perd l'accès que cette équipe donne à ${
              productCountText(team.productCount)
            }, même dans un document ouvert.`,
          pt:
            `Remover este utilizador de "${team.label}"? Perde o acesso que esta equipa dá a ${
              productCountText(team.productCount)
            }, mesmo num documento aberto.`,
        })
        : t3({
          en: `Remove this user from "${team.label}"?`,
          fr: `Retirer cet utilisateur de « ${team.label} » ?`,
          pt: `Remover este utilizador de "${team.label}"?`,
        }),
      intent: "danger",
      confirmButtonLabel: t3({ en: "Remove", fr: "Retirer", pt: "Remover" }),
    });
    if (!confirmed) return;
    await remove.click(team.id);
  }

  return (
    <Card header={teamsLabel()}>
      <div class="ui-spy-sm">
        <Show when={p.user.isGlobalAdmin}>
          <div class="text-base-content-muted text-sm">
            {administratorFullAccessLabel()}
          </div>
        </Show>
        <Show
          when={teams().length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "This user is not in any team.",
                fr: "Cet utilisateur ne fait partie d'aucune équipe.",
                pt: "Este utilizador não faz parte de nenhuma equipa.",
              })}
            </div>
          }
        >
          <div class="rounded border">
            <For each={teams()}>
              {(team) => (
                <div class="ui-gap-sm ui-pad-sm flex items-center border-b last:border-b-0">
                  <div class="min-w-0 flex-1">
                    <div class="truncate">{team.label}</div>
                    <div class="text-base-content-muted text-xs">
                      {t3({
                        en: `Gives access to ${
                          productCountText(team.productCount)
                        }`,
                        fr: `Donne accès à ${
                          productCountText(team.productCount)
                        }`,
                        pt: `Dá acesso a ${
                          productCountText(team.productCount)
                        }`,
                      })}
                    </div>
                  </div>
                  <Show when={mayRemove()}>
                    <Button
                      size="sm"
                      outline
                      iconName="x"
                      ariaLabel={t3({
                        en: "Remove from team",
                        fr: "Retirer de l'équipe",
                        pt: "Remover da equipa",
                      })}
                      onClick={() => attemptRemove(team)}
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={mayAdd() && options().length > 0}>
          <SelectSearch
            value={undefined}
            options={options()}
            onChange={attemptAdd}
            placeholder={t3({
              en: "Add to a team…",
              fr: "Ajouter à une équipe…",
              pt: "Adicionar a uma equipa…",
            })}
            fullWidth
          />
        </Show>
      </div>
    </Card>
  );
}
