import {
  packageScopesEqual,
  productScope,
  t3,
  type PackageScope,
  type ProductSummary,
} from "lib";
import {
  ModalContainer,
  Callout,
  Select,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import {
  ScopePicker,
  scopeSelectionFromStored,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/scope_picker";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  product: ProductSummary;
  // How many of the open document's figures would be stale under a candidate
  // pair. Absent outside an editor, where no figures are loaded to count.
  countStaleUnder?: (pair: PackageScope) => Promise<number>;
};

type ReturnType = { lastUpdated: string } | undefined;

// THE surface for changing a product's (package, scope) pair, opened from the
// PackageScopeChip in both editor headers and from the product menu. Changing
// either never blocks and has no compatibility pre-flight: figures that no
// longer match the pair show their own stale badge and "Update to <package>"
// action (D4). The count below is the one forewarning.
export function PackageScopeModal(p: AlertComponentProps<Props, ReturnType>) {
  const [tempRunId, setTempRunId] = createSignal(p.product.runId);
  const [tempScope, setTempScope] = createSignal<ScopeSelection>(
    scopeSelectionFromStored(p.product.adminArea2),
  );

  // Captured at open, never derived from the current pick: an option list that
  // moved with the selection would rebuild every <option> node on each pick.
  // The one entry not in the ready list is the package this product is ALREADY
  // attached to: a package can stop being ready while products still point at
  // it, and dropping it from the list would silently reattach the product on
  // the next save.
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

  const candidate = (): PackageScope | undefined => {
    const adminArea2 = storedValueFromScopeSelection(tempScope());
    return adminArea2 === undefined
      ? undefined
      : { runId: tempRunId(), adminArea2 };
  };

  const [staleCount, setStaleCount] = createSignal<number | undefined>();
  createEffect(() => {
    const count = p.countStaleUnder;
    const pair = candidate();
    setStaleCount(undefined);
    if (!count || !pair || packageScopesEqual(pair, productScope(p.product))) {
      return;
    }
    let live = true;
    onCleanup(() => {
      live = false;
    });
    void count(pair).then((n) => {
      if (live) setStaleCount(n);
    });
  });

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
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

      // Only what actually changed is written; each write bumps the product's
      // version, and every open surface re-renders off the SSE echo.
      let lastUpdated = p.product.lastUpdated;
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
    <ModalContainer
      title={t3({
        en: "Results package and scope",
        fr: "Paquet de résultats et portée",
        pt: "Pacote de resultados e âmbito",
      })}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
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
          options={packageOptions()}
          value={tempRunId()}
          onChange={setTempRunId}
          fullWidth
        />
        <ScopePicker selection={tempScope()} onChange={setTempScope} />
        <Show when={staleCount()} keyed>
          {(n) => (
            <Callout intent="warning" pad="sm">
              {t3({
                en: `${n} figure(s) were built under the current package and scope. After saving they show as stale until you update them.`,
                fr: `${n} figure(s) ont été construites avec le paquet et la portée actuels. Après l'enregistrement, elles apparaîtront comme obsolètes jusqu'à leur mise à jour.`,
                pt: `${n} figura(s) foram construídas com o pacote e o âmbito atuais. Depois de guardar, aparecem como desatualizadas até serem atualizadas.`,
              })}
            </Callout>
          )}
        </Show>
      </div>
    </ModalContainer>
  );
}
