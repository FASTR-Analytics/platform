import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  type EmptyCreatableProductType,
  type ScopeId,
  t3,
  TC,
} from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  Input,
  ModalContainer,
  Select,
} from "panther";
import { createMemo, createSignal, Show } from "solid-js";
import {
  readyPackageOptionLabel,
  ScopeSelect,
  scopeSelectLabel,
} from "~/components/_shared/mod.ts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { folderPathOptions, GENERAL_ID, generalLabel } from "./_shared/mod.ts";

// `create` makes an empty deck or report on the chosen pair. `pick` only
// returns the pair: a visualization is created after its first figure is
// chosen and resolved under it (createVisualizationInteractively).
type Props = {
  mode: { kind: "create"; type: EmptyCreatableProductType } | { kind: "pick" };
  title: string;
};

type ReturnType =
  | { kind: "created"; productId: string }
  | { kind: "picked"; runId: string; scopeId: ScopeId }
  | undefined;

// A new product names its package and its scope before it exists: the row
// needs both at insert. The package starts on the pin and the scope on "All
// data". A restricted user's list never holds "All data", so their scope
// starts chosen only when there is exactly one to choose. A deck or report
// also takes its name (required, no default) and its folder (General first)
// here; a picked visualization is named after its figure and lands in General.
export function CreateProductModal(p: AlertComponentProps<Props, ReturnType>) {
  const [label, setLabel] = createSignal("");
  const [folderId, setFolderId] = createSignal(GENERAL_ID);
  const folderOptions = createMemo(() => [
    { value: GENERAL_ID, label: generalLabel() },
    ...folderPathOptions(instanceState.folders, {}),
  ]);
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
    async (
      e: MouseEvent,
    ): Promise<APIResponseWithData<NonNullable<ReturnType>>> => {
      e.preventDefault();
      const chosenLabel = label().trim();
      if (p.mode.kind === "create" && !chosenLabel) {
        return { success: false, err: t3(TC.mustEnterName) };
      }
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
      if (p.mode.kind === "pick") {
        return {
          success: true as const,
          data: {
            kind: "picked" as const,
            runId: chosenRunId,
            scopeId: chosenScopeId,
          },
        };
      }
      const res = await serverActions.createProduct({
        type: p.mode.type,
        label: chosenLabel,
        folderId: folderId() === GENERAL_ID ? null : folderId(),
        runId: chosenRunId,
        scopeId: chosenScopeId,
      });
      return res.success
        ? {
          success: true as const,
          data: { kind: "created" as const, productId: res.data.productId },
        }
        : res;
    },
    (data: NonNullable<ReturnType>) => {
      p.close(data);
    },
  );

  return (
    <ModalContainer
      title={p.title}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: p.mode.kind === "pick"
          ? t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })
          : t3({ en: "Create", fr: "Créer", pt: "Criar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy-sm">
        <Show when={p.mode.kind === "create"}>
          <Input
            label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
            value={label()}
            onChange={setLabel}
            autoFocus
            fullWidth
          />
          <Select
            label={t3(TC.folder)}
            options={folderOptions()}
            value={folderId()}
            onChange={setFolderId}
            fullWidth
          />
        </Show>
        <Select
          label={t3({
            en: "Results package",
            fr: "Paquet de résultats",
            pt: "Pacote de resultados",
          })}
          options={instanceState.readyPackages.map((pkg) => ({
            value: pkg.id,
            label: readyPackageOptionLabel(pkg),
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
