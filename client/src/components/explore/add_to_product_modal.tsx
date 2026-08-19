import {
  productScope,
  t3,
  type ContentSlide,
  type FigureBlock,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type ProductSummary,
} from "lib";
import {
  AlertFormHolder,
  Select,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createMemo, createSignal } from "solid-js";
import { resolveBundleFromMetricAndConfig } from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getReportDetailFromCacheOrFetch } from "~/state/products/t2_report_detail";

type Props = {
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
  caption: string;
};

type ReturnType = { productId: string } | undefined;

// Explore's `(package, scope)` pair is ephemeral and belongs to nobody (D6), so
// nothing here carries it over: the figure is RE-RESOLVED under the TARGET
// product's own pair, through that package's own authoring context. A metric
// the target's package does not carry is a typed failure, not a broken figure.
export function AddToProductModal(p: AlertComponentProps<Props, ReturnType>) {
  const productOptions = createMemo(() =>
    instanceState.products.map((product) => ({
      value: product.id,
      label: product.label,
    })),
  );

  const [selectedProductId, setSelectedProductId] = createSignal<string>(
    instanceState.products[0]?.id ?? "",
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const product = instanceState.products.find(
        (x) => x.id === selectedProductId(),
      );
      if (!product) {
        return {
          success: false as const,
          err: t3({
            en: "Select a deck or report",
            fr: "Sélectionnez une présentation ou un rapport",
            pt: "Selecione uma apresentação ou um relatório",
          }),
        };
      }

      const scope = productScope(product);
      const contextRes = await getRunAuthoringContextFromCacheOrFetch(
        scope.runId,
      );
      if (!contextRes.success) return contextRes;

      const metric = contextRes.data.metrics.find(
        (m) => m.id === p.metric.id,
      );
      if (!metric || metric.status !== "ready") {
        return {
          success: false as const,
          err: t3({
            en: `"${p.metric.label}" is not available in the results package "${product.label}" is attached to`,
            fr: `« ${p.metric.label} » n'est pas disponible dans le paquet de résultats rattaché à « ${product.label} »`,
            pt: `"${p.metric.label}" não está disponível no pacote de resultados anexado a "${product.label}"`,
          }),
        };
      }

      const bundle = await resolveBundleFromMetricAndConfig(
        scope,
        metric,
        p.config,
      );
      const figureBlock: FigureBlock = { type: "figure", bundle };

      const res =
        product.type === "slide_deck"
          ? await addFigureToDeck(product, figureBlock, p.caption)
          : await addFigureToReport(product, figureBlock, p.caption);
      if (!res.success) return res;

      return { success: true, data: { productId: product.id } };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="add-to-product"
      header={t3({
        en: "Add to deck or report",
        fr: "Ajouter à une présentation ou un rapport",
        pt: "Adicionar a uma apresentação ou relatório",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={!selectedProductId()}
    >
      <Select
        label={t3({ en: "Product", fr: "Produit", pt: "Produto" })}
        options={productOptions()}
        value={selectedProductId()}
        onChange={setSelectedProductId}
        fullWidth
      />
    </AlertFormHolder>
  );
}

async function addFigureToDeck(
  product: ProductSummary,
  figureBlock: FigureBlock,
  caption: string,
) {
  const slide: ContentSlide = {
    type: "content",
    header: caption,
    layout: { type: "item", id: "a1a", data: figureBlock },
  };
  return await serverActions.createSlide({
    deck_id: product.id,
    position: { toEnd: true },
    slide,
  });
}

// Captions live inside `![caption](figure:id)`, so the token must not carry
// brackets or newlines.
function sanitizeCaption(s: string): string {
  return s
    .replace(/[[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function addFigureToReport(
  product: ProductSummary,
  figureBlock: FigureBlock,
  caption: string,
) {
  const detailRes = await getReportDetailFromCacheOrFetch(product.id);
  if (!detailRes.success) return detailRes;
  const detail = detailRes.data;

  const figureId = crypto.randomUUID();
  const figuresRes = await serverActions.updateReportFigures({
    report_id: product.id,
    figures: { ...detail.figures, [figureId]: figureBlock },
  });
  if (!figuresRes.success) return figuresRes;

  // Appended with the version the figures write just produced as the
  // expectation: a report open in an editor elsewhere comes back `conflicted`
  // rather than silently losing the other session's edits.
  const bodyRes = await serverActions.updateReportBody({
    report_id: product.id,
    body: `${detail.body.trimEnd()}\n\n![${sanitizeCaption(caption)}](figure:${figureId})\n`,
    expectedLastUpdated: figuresRes.data.lastUpdated,
    overwrite: false,
  });
  if (!bodyRes.success) return bodyRes;
  if (bodyRes.data.conflicted) {
    return {
      success: false as const,
      err: t3({
        en: `"${product.label}" is being edited elsewhere — open it and insert the figure there`,
        fr: `« ${product.label} » est en cours de modification ailleurs — ouvrez-le et insérez la figure sur place`,
        pt: `"${product.label}" está a ser editado noutro local — abra-o e insira a figura aí`,
      }),
    };
  }
  return bodyRes;
}
