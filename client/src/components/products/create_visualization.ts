import { t3 } from "lib";
import { openAlert, openComponent } from "panther";
import { serverActions } from "~/server_actions";
import { resolveScope } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { resolveFigureBundleInteractively } from "~/generate_visualization/mod";
import { InsertFigureModal } from "./_shared/mod.ts";
import { CreateProductModal } from "./create_product_modal";

// A new visualization in three steps: the pair (the same dialog a deck or a
// report is created from, returning the pair instead of creating), the
// figure (the insert-figure wizard: metric, preset, configure), then one
// create carrying the figure resolved under that pair. A cancel at any step
// creates nothing, so a visualization never exists without its figure.
export async function createVisualizationInteractively(
  title: string,
): Promise<{ productId: string } | undefined> {
  const picked = await openComponent({
    element: CreateProductModal,
    props: { mode: { kind: "pick" as const }, title },
  });
  if (picked?.kind !== "picked") return undefined;
  const pair = { runId: picked.runId, scopeId: picked.scopeId };

  const contextRes = await getRunAuthoringContextFromCacheOrFetch(
    resolveScope(pair),
  );
  if (!contextRes.success) {
    await openAlert({ text: contextRes.err, intent: "danger" });
    return undefined;
  }

  const figure = await openComponent({
    element: InsertFigureModal,
    props: {
      scope: pair,
      context: contextRes.data,
      preselectedMetricId: null,
    },
  });
  if (!figure) return undefined;

  const resolved = await resolveFigureBundleInteractively(
    pair,
    figure.metric,
    figure.config,
  );
  if (!resolved.ok) {
    await openAlert({ text: resolved.reason, intent: "danger" });
    return undefined;
  }

  const res = await serverActions.createVisualization({
    folderId: null,
    runId: pair.runId,
    scopeId: pair.scopeId,
    label: figure.metric.label,
    bundle: resolved.bundle,
  });
  if (!res.success) {
    await openAlert({
      text: res.err ||
        t3({
          en: "The visualization could not be created",
          fr: "La visualisation n'a pas pu être créée",
          pt: "Não foi possível criar a visualização",
        }),
      intent: "danger",
    });
    return undefined;
  }
  return { productId: res.data.productId };
}
