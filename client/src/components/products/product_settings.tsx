import { t3, TC, type ProductSummary } from "lib";
import {
  AlertFormHolder,
  Input,
  Select,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createMemo, createSignal } from "solid-js";
import {
  ScopePicker,
  scopeSelectionFromStored,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/scope_picker";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { folderPathOptions } from "./folder_tree";

const _NO_FOLDER = "_none";

type Props = {
  product: ProductSummary;
};

type ReturnType = { lastUpdated: string } | undefined;

// THE product settings surface (D16): the card menu and both editor headers
// open this one component. Changing package or scope never blocks and has no
// compatibility pre-flight — figures that no longer match the product's pair
// show their own stale badge and "Update to <package>" action (D4).
export function ProductSettings(p: AlertComponentProps<Props, ReturnType>) {
  const [tempLabel, setTempLabel] = createSignal(p.product.label);
  const [tempFolderId, setTempFolderId] = createSignal(
    p.product.folderId ?? _NO_FOLDER,
  );
  const [tempRunId, setTempRunId] = createSignal(p.product.runId);
  const [tempScope, setTempScope] = createSignal<ScopeSelection>(
    scopeSelectionFromStored(p.product.adminArea2),
  );

  // Full paths, sorted by path, "No folder" first (D15).
  const folderOptions = createMemo(() => [
    { value: _NO_FOLDER, label: t3(TC.noFolder) },
    ...folderPathOptions(instanceState.folders, {}).map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
  ]);

  // Captured at open, never derived from the current pick: an option list that
  // moved with the selection would rebuild every <option> node on each pick.
  // The one entry not in the ready list is the package this product is ALREADY
  // attached to — a package can stop being ready (or be deleted from the
  // catalogue's point of view) while products still point at it, and dropping
  // it from the list would silently reattach the product on the next save.
  const attachedRunId = p.product.runId;
  const packageOptions = createMemo(() => {
    const packages = instanceState.readyPackages;
    const attachedIsReady = packages.some((pkg) => pkg.id === attachedRunId);
    return [
      ...(attachedIsReady
        ? []
        : [
            {
              value: attachedRunId,
              label: t3({
                en: "Currently attached package (no longer listed)",
                fr: "Paquet actuellement rattaché (non répertorié)",
                pt: "Pacote atualmente anexado (já não listado)",
              }),
            },
          ]),
      ...packages.map((pkg) => ({ value: pkg.id, label: pkg.label })),
    ];
  });

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const label = tempLabel().trim();
      if (!label) {
        return { success: false, err: t3(TC.mustEnterName) };
      }
      const adminArea2 = storedValueFromScopeSelection(tempScope());
      if (adminArea2 === undefined) {
        return {
          success: false,
          err: t3({
            en: "Select an area, or choose national scope",
            fr: "Sélectionnez une zone ou choisissez la portée nationale",
            pt: "Selecione uma zona ou escolha o âmbito nacional",
          }),
        };
      }
      const folderId = tempFolderId() === _NO_FOLDER ? null : tempFolderId();

      // Only what actually changed is written; each write bumps the product's
      // version, and the page re-renders off the SSE echo.
      let lastUpdated = p.product.lastUpdated;

      if (label !== p.product.label) {
        const res = await serverActions.updateProductLabel({
          product_id: p.product.id,
          label,
        });
        if (!res.success) return res;
        lastUpdated = res.data.lastUpdated;
      }
      if (folderId !== p.product.folderId) {
        const res = await serverActions.moveProductsToFolder({
          productIds: [p.product.id],
          folderId,
        });
        if (!res.success) return res;
        lastUpdated = res.data.lastUpdated;
      }
      if (tempRunId() !== p.product.runId) {
        const res = await serverActions.setProductPackage({
          product_id: p.product.id,
          runId: tempRunId(),
        });
        if (!res.success) return res;
        lastUpdated = res.data.lastUpdated;
      }
      if (adminArea2 !== p.product.adminArea2) {
        const res = await serverActions.setProductScope({
          product_id: p.product.id,
          adminArea2,
        });
        if (!res.success) return res;
        lastUpdated = res.data.lastUpdated;
      }

      return { success: true, data: { lastUpdated } };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="product-settings"
      header={t3(TC.settings)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy-sm">
        <Input
          label={t3({ en: "Name", fr: "Nom", pt: "Nome" })}
          value={tempLabel()}
          onChange={setTempLabel}
          autoFocus
          fullWidth
        />
        <Select
          label={t3(TC.folder)}
          options={folderOptions()}
          value={tempFolderId()}
          onChange={setTempFolderId}
          fullWidth
        />
        <Select
          label={t3({
            en: "Results package",
            fr: "Paquet de résultats",
            pt: "Pacote de resultados",
          })}
          options={packageOptions()}
          value={tempRunId()}
          onChange={setTempRunId}
          fullWidth
        />
        <ScopePicker selection={tempScope()} onChange={setTempScope} />
      </div>
    </AlertFormHolder>
  );
}
