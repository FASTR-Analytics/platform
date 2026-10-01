import {
  ALL_DATA_SCOPE_ID,
  type OtherUser,
  type ScopeAccess,
  scopeAccessEqual,
  t3,
  TC,
} from "lib";
import {
  Button,
  Card,
  Checkbox,
  createButtonAction,
  MultiSelectSearch,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// A user's scope access (PLAN_SCOPES §2.6). Shown to global admins only, the
// guard on setUserScopeAccess (R25), and never for a global admin, who always
// has every scope. The list is copied out of the store row so editing it
// never touches T1.
export function UserScopesCard(p: { user: OtherUser }) {
  const initial = (): ScopeAccess =>
    p.user.scopeAccess.all
      ? { all: true }
      : { all: false, scopeIds: [...p.user.scopeAccess.scopeIds] };
  const [saved, setSaved] = createSignal<ScopeAccess>(initial());
  const [allData, setAllData] = createSignal(saved().all);
  const [scopeIds, setScopeIds] = createSignal<string[]>(
    p.user.scopeAccess.all ? [] : [...p.user.scopeAccess.scopeIds],
  );

  const edited = (): ScopeAccess =>
    allData() ? { all: true } : { all: false, scopeIds: scopeIds() };
  const hasChanges = () => !scopeAccessEqual(edited(), saved());

  const save = createButtonAction(
    () =>
      serverActions.setUserScopeAccess({
        email: p.user.email,
        scopeAccess: edited(),
      }),
    () => {
      setSaved(edited());
    },
  );

  // "All data" is the checkbox, never a grant: setUserScopeAccess refuses it.
  const options = () =>
    instanceState.scopes
      .filter((s) => s.id !== ALL_DATA_SCOPE_ID)
      .map((s) => ({ value: s.id, label: s.label }));

  return (
    <Card
      header={t3({ en: "Scopes", fr: "Portées", pt: "Âmbitos" })}
      headerRight={
        <Show when={hasChanges()}>
          <Button onClick={save.click} state={save.state()}>
            {t3({
              en: "Save Changes",
              fr: "Sauvegarder les modifications",
              pt: "Guardar alterações",
            })}
          </Button>
        </Show>
      }
    >
      <div class="ui-spy-sm">
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
              en: "No scopes: this user sees no products",
              fr: "Aucune portée : cet utilisateur ne voit aucun produit",
              pt: "Nenhum âmbito: este utilizador não vê nenhum produto",
            })}
            fullWidth
          />
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                "This user sees only products that carry one of these scopes, and reads data only through them. They have no Explore, and cannot view or configure data or view logs, whatever their permissions say.",
              fr:
                "Cet utilisateur ne voit que les produits portant l'une de ces portées et ne lit les données qu'à travers elles. Il n'a pas accès à Explorer et ne peut ni consulter ni configurer les données, ni consulter les journaux, quels que soient ses droits.",
              pt:
                "Este utilizador vê apenas os produtos com um destes âmbitos e lê dados apenas através deles. Não tem acesso a Explorar e não pode ver nem configurar dados nem ver registos, sejam quais forem as suas permissões.",
            })}
          </div>
        </Show>
      </div>
    </Card>
  );
}
