import { t3, type ProductSummary } from "lib";
import {
  AlertFormHolder,
  ProgressBar,
  createFormAction,
  getProgress,
  type AlertComponentProps,
} from "panther";
import { For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  products: ProductSummary[];
};

type ReturnType = { productIds: string[] } | undefined;

// `duplicateProduct` clones `(run_id, admin_area_2)` verbatim and mints its own
// label (D5), so there is nothing to fill in — this surface exists to confirm
// the batch and to show progress while it runs.
export function DuplicateProductsModal(
  p: AlertComponentProps<Props, ReturnType>,
) {
  const progress = getProgress();

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const total = p.products.length;
      const productIds: string[] = [];

      for (let i = 0; i < total; i++) {
        const product = p.products[i];
        progress.onProgress(
          i / total,
          t3({
            en: `Duplicating ${i + 1} of ${total}...`,
            fr: `Duplication de ${i + 1} sur ${total}...`,
            pt: `A duplicar ${i + 1} de ${total}...`,
          }),
        );
        const res = await serverActions.duplicateProduct({
          product_id: product.id,
        });
        if (!res.success) {
          return {
            success: false,
            err: t3({
              en: `Failed on "${product.label}": ${res.err}. ${productIds.length} duplicated.`,
              fr: `Échec sur « ${product.label} » : ${res.err}. ${productIds.length} dupliqué(s).`,
              pt: `Falhou em "${product.label}": ${res.err}. ${productIds.length} duplicado(s).`,
            }),
          };
        }
        productIds.push(res.data.productId);
      }

      progress.onProgress(1, "");
      return { success: true, data: { productIds } };
    },
    (data) => {
      p.close(data);
    },
  );

  const header = () =>
    p.products.length > 1
      ? t3({
          en: `Duplicate ${p.products.length} products`,
          fr: `Dupliquer ${p.products.length} produits`,
          pt: `Duplicar ${p.products.length} produtos`,
        })
      : t3({ en: "Duplicate", fr: "Dupliquer", pt: "Duplicar" });

  return (
    <AlertFormHolder
      formId="duplicate-products"
      header={header()}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy-sm">
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Each copy keeps the original's results package and scope.",
            fr: "Chaque copie conserve le paquet de résultats et la portée de l'original.",
            pt: "Cada cópia mantém o pacote de resultados e o âmbito do original.",
          })}
        </div>
        <div class="ui-spy-sm max-h-64 overflow-auto">
          <For each={p.products}>
            {(product) => (
              <div class="ui-pad-sm border-b last:border-b-0">
                <span class="flex-1 truncate">{product.label}</span>
              </div>
            )}
          </For>
        </div>
        <Show
          when={p.products.length > 1 && save.state().status === "loading"}
        >
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        </Show>
      </div>
    </AlertFormHolder>
  );
}
