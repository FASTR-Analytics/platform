import { ALL_DATA_SCOPE_ID, type ProductType, type ScopeId, t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  ModalContainer,
  Select,
} from "panther";
import { createSignal } from "solid-js";
import { ScopeSelect, scopeSelectLabel } from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  type: ProductType;
  title: string;
};

type ReturnType = { productId: string } | undefined;

// A new product names its package and its scope before it exists: the row
// needs both at insert. The package starts on the pin and the scope on "All
// data". A restricted user's list never holds "All data", so their scope
// starts chosen only when there is exactly one to choose.
export function CreateProductModal(p: AlertComponentProps<Props, ReturnType>) {
  const pinIsReady = instanceState.readyPackages.some(
    (pkg) => pkg.id === instanceState.pinnedRunId,
  );
  const [runId, setRunId] = createSignal<string | undefined>(
    pinIsReady
      ? instanceState.pinnedRunId ?? undefined
      : instanceState.readyPackages.length === 1
      ? instanceState.readyPackages[0].id
      : undefined,
  );
  const [scopeId, setScopeId] = createSignal<ScopeId | undefined>(
    instanceState.scopes.some((s) => s.id === ALL_DATA_SCOPE_ID)
      ? ALL_DATA_SCOPE_ID
      : instanceState.scopes.length === 1
      ? instanceState.scopes[0].id
      : undefined,
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const chosenRunId = runId();
      const chosenScopeId = scopeId();
      if (chosenRunId === undefined || chosenScopeId === undefined) {
        return {
          success: false,
          err: t3({
            en: "Select a results package and a scope",
            fr: "Sélectionnez un paquet de résultats et une portée",
            pt: "Selecione um pacote de resultados e um âmbito",
          }),
        };
      }
      return await serverActions.createProduct({
        type: p.type,
        folderId: null,
        runId: chosenRunId,
        scopeId: chosenScopeId,
      });
    },
    (data) => {
      p.close({ productId: data.productId });
    },
  );

  return (
    <ModalContainer
      title={p.title}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Create", fr: "Créer", pt: "Criar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy-sm">
        <Select
          label={t3({
            en: "Results package",
            fr: "Paquet de résultats",
            pt: "Pacote de resultados",
          })}
          options={instanceState.readyPackages.map((pkg) => ({
            value: pkg.id,
            label: pkg.label,
          }))}
          value={runId()}
          onChange={setRunId}
          placeholder={t3({
            en: "Select a results package",
            fr: "Sélectionner un paquet de résultats",
            pt: "Selecionar um pacote de resultados",
          })}
          fullWidth
        />
        <ScopeSelect
          label={scopeSelectLabel()}
          scopeId={scopeId()}
          onChange={setScopeId}
          fullWidth
        />
      </div>
    </ModalContainer>
  );
}
