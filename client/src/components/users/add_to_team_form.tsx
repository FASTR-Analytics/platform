import { t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  ModalContainer,
  plural,
  Select,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { joiningGivesAccessText } from "./team_text";

type Props = {
  // The users to add; the caller's own address already left out when they
  // may not add themselves.
  emails: string[];
  // The caller selected their own row and is not a global admin.
  skippedSelf: boolean;
};

// The users table's batch action: every selected user joins one team
// (addTeamMembers). It only adds: a user already in the team stays as they
// are, and nobody leaves a team here.
export function AddToTeamForm(p: AlertComponentProps<Props, undefined>) {
  const [teamId, setTeamId] = createSignal<string | undefined>(
    instanceState.teams.at(0)?.id,
  );
  const team = () => instanceState.teams.find((t) => t.id === teamId());
  // The selected users not yet in the chosen team: the ones who gain access.
  const joining = () => {
    const id = teamId();
    if (id === undefined) return [];
    const selected = new Set(p.emails);
    return instanceState.users.filter((u) =>
      selected.has(u.email) && !u.teamIds.includes(id)
    );
  };

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const id = teamId();
      if (id === undefined) {
        return {
          success: false,
          err: t3({
            en: "Choose a team",
            fr: "Choisissez une équipe",
            pt: "Escolha uma equipa",
          }),
        };
      }
      return serverActions.addTeamMembers({ team_id: id, emails: p.emails });
    },
    () => p.close(undefined),
  );

  const userCount = p.emails.length;

  return (
    <ModalContainer
      width="sm"
      title={plural(userCount, {
        one: t3({
          en: `Add ${userCount} user to a team`,
          fr: `Ajouter ${userCount} utilisateur à une équipe`,
          pt: `Adicionar ${userCount} utilizador a uma equipa`,
        }),
        other: t3({
          en: `Add ${userCount} users to a team`,
          fr: `Ajouter ${userCount} utilisateurs à une équipe`,
          pt: `Adicionar ${userCount} utilizadores a uma equipa`,
        }),
      })}
      actions={[
        {
          label: t3({ en: "Add to team", fr: "Ajouter", pt: "Adicionar" }),
          onClick: save.click,
          state: save.state(),
          disabled: team() === undefined || userCount === 0,
        },
      ]}
      onCancel={() => p.close(undefined)}
    >
      <div class="ui-spy-sm">
        <Show
          when={instanceState.teams.length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en:
                  "There are no teams yet. Create one with the Teams button on the Users page.",
                fr:
                  "Il n'y a pas encore d'équipe. Créez-en une avec le bouton Équipes de la page Utilisateurs.",
                pt:
                  "Ainda não existem equipas. Crie uma com o botão Equipas da página Utilizadores.",
              })}
            </div>
          }
        >
          <Select
            label={t3({ en: "Team", fr: "Équipe", pt: "Equipa" })}
            options={instanceState.teams.map((t) => ({
              value: t.id,
              label: t.label,
            }))}
            value={teamId()}
            onChange={setTeamId}
            fullWidth
          />
          <Show when={team()} keyed>
            {(chosen) => (
              <div class="text-sm">
                {joining().length === 0
                  ? t3({
                    en: "Everyone selected is already in this team.",
                    fr:
                      "Toutes les personnes sélectionnées font déjà partie de cette équipe.",
                    pt: "Todas as pessoas selecionadas já estão nesta equipa.",
                  })
                  : chosen.productCount > 0
                  ? joiningGivesAccessText(
                    joining().length,
                    chosen.productCount,
                  )
                  : t3({
                    en:
                      "This team has no access to any product yet, so joining it changes nothing today.",
                    fr:
                      "Cette équipe n'a encore accès à aucun produit ; la rejoindre ne change donc rien pour l'instant.",
                    pt:
                      "Esta equipa ainda não tem acesso a nenhum produto, por isso entrar nela não altera nada por agora.",
                  })}
              </div>
            )}
          </Show>
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "This only adds people. Someone already in the team stays in it, and nobody is removed from any team.",
              fr:
                "Ceci ne fait qu'ajouter des personnes. Un membre déjà présent le reste, et personne n'est retiré d'une équipe.",
              pt:
                "Isto apenas adiciona pessoas. Quem já está na equipa mantém-se, e ninguém é removido de nenhuma equipa.",
            })}
          </div>
        </Show>
        <Show when={p.skippedSelf}>
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "You cannot add yourself to a team, so your own row is left out. Ask another user manager or an administrator.",
              fr:
                "Vous ne pouvez pas vous ajouter à une équipe ; votre propre ligne est donc ignorée. Demandez à un autre gestionnaire d'utilisateurs ou à un administrateur.",
              pt:
                "Não pode adicionar-se a uma equipa, por isso a sua própria linha é ignorada. Peça a outro gestor de utilizadores ou a um administrador.",
            })}
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
