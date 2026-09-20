import { t3, TC, type ProductSummary } from "lib";
import {
  AlertFormHolder,
  Input,
  Select,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { folderPathOptions } from "./folder_tree";

const _NO_FOLDER = "_none";

type Props = {
  product: ProductSummary;
};

type ReturnType = { lastUpdated: string } | undefined;

// THE product settings surface (D16): name and folder, opened from the card
// menu and both editor headers. The (package, scope) pair has its own surface,
// PackageScopeModal, behind the PackageScopeChip.
export function ProductSettings(p: AlertComponentProps<Props, ReturnType>) {
  const [tempLabel, setTempLabel] = createSignal(p.product.label);
  const [tempFolderId, setTempFolderId] = createSignal(
    p.product.folderId ?? _NO_FOLDER,
  );

  // The same flat full-path list, sorted by path with "No folder" first, that
  // the move picker shows (D16).
  const folderOptions = createMemo(() => [
    {
      value: _NO_FOLDER,
      label: t3({ en: "No folder", fr: "Aucun dossier", pt: "Sem pasta" }),
    },
    ...folderPathOptions(instanceState.folders, {}),
  ]);

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const label = tempLabel().trim();
      if (!label) {
        return { success: false, err: t3(TC.mustEnterName) };
      }
      const folderId = tempFolderId() === _NO_FOLDER ? null : tempFolderId();

      // Only what actually changed is written; each write bumps the product's
      // version, and every open surface re-renders off the SSE echo.
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
      </div>
    </AlertFormHolder>
  );
}
