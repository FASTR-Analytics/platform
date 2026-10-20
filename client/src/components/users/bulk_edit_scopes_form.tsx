import { ALL_DATA_SCOPE_ID, type ScopeUuid, t3, TC } from "lib";
import {
  type AlertComponentProps,
  Checkbox,
  createFormAction,
  ModalContainer,
  MultiSelectSearch,
  plural,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  // The users whose scope access is replaced; global admins already left out.
  emails: string[];
  // Selected global admins, who always have every scope and are not changed.
  skippedAdmins: number;
};

// The users table's batch action: one scope access, "All data" or a list of
// scopes, written to every selected user (bulkSetUserScopeAccess).
export function BulkEditScopesForm(p: AlertComponentProps<Props, undefined>) {
  const [allData, setAllData] = createSignal(true);
  const [scopeIds, setScopeIds] = createSignal<ScopeUuid[]>([]);

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      return serverActions.bulkSetUserScopeAccess({
        emails: p.emails,
        scopeAccess: allData()
          ? { all: true }
          : { all: false, scopeIds: scopeIds() },
      });
    },
    async () => {},
    () => p.close(undefined),
  );

  // "All data" is the checkbox, never a grant: a grant is a ScopeUuid.
  const options = () =>
    instanceState.scopes.flatMap((s) =>
      s.id === ALL_DATA_SCOPE_ID ? [] : [{ value: s.id, label: s.label }]
    );

  const userCount = p.emails.length;

  return (
    <ModalContainer
      width="sm"
      title={plural(userCount, {
        one: t3({
          en: `Edit scopes for ${userCount} user`,
          fr: `Modifier les portées pour ${userCount} utilisateur`,
          pt: `Editar âmbitos para ${userCount} utilizador`,
        }),
        other: t3({
          en: `Edit scopes for ${userCount} users`,
          fr: `Modifier les portées pour ${userCount} utilisateurs`,
          pt: `Editar âmbitos para ${userCount} utilizadores`,
        }),
      })}
      actions={[
        {
          label: t3(TC.save),
          onClick: save.click,
          state: save.state(),
          iconName: "save",
        },
      ]}
      onCancel={() => p.close(undefined)}
    >
      <div class="ui-spy-sm">
        <div class="text-base-content-muted text-sm">
          {t3({
            en:
              "This replaces the scopes of every selected user with what you choose here.",
            fr:
              "Ceci remplace les portées de chaque utilisateur sélectionné par ce que vous choisissez ici.",
            pt:
              "Isto substitui os âmbitos de cada utilizador selecionado pelo que escolher aqui.",
          })}
        </div>
        <Checkbox
          label={t3(TC.allData)}
          checked={allData()}
          onChange={setAllData}
        />
        <Show when={!allData()}>
          <MultiSelectSearch
            values={scopeIds()}
            options={options()}
            onChange={setScopeIds}
            placeholder={t3({
              en: "No scopes: these users see no products",
              fr: "Aucune portée : ces utilisateurs ne voient aucun produit",
              pt: "Nenhum âmbito: estes utilizadores não veem nenhum produto",
            })}
            fullWidth
          />
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "These users will see only products that carry one of these scopes, and read data only through them. They have no Explore, and cannot view or configure data or view logs, whatever their permissions say.",
              fr:
                "Ces utilisateurs ne verront que les produits portant l'une de ces portées et ne liront les données qu'à travers elles. Ils n'ont pas accès à Explorer et ne peuvent ni consulter ni configurer les données, ni consulter les journaux, quels que soient leurs droits.",
              pt:
                "Estes utilizadores verão apenas os produtos com um destes âmbitos e lerão dados apenas através deles. Não têm acesso a Explorar e não podem ver nem configurar dados nem ver registos, sejam quais forem as suas permissões.",
            })}
          </div>
        </Show>
        <Show when={p.skippedAdmins > 0}>
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                `${p.skippedAdmins} selected administrator(s) always have every scope and are not changed.`,
              fr:
                `${p.skippedAdmins} administrateur(s) sélectionné(s) ont toujours toutes les portées et ne sont pas modifiés.`,
              pt:
                `${p.skippedAdmins} administrador(es) selecionado(s) têm sempre todos os âmbitos e não são alterados.`,
            })}
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
