import {
  isVisualizationStale,
  productScope,
  type ProductSummary,
  t3,
} from "lib";
import { Icon, openAlert } from "panther";
import { createSignal, Show } from "solid-js";
import { packageLabel, scopeLabel } from "~/components/_shared/mod.ts";
import { updateFigureToScope } from "~/components/_shared/figure_editor/mod.ts";
import { serverActions } from "~/server_actions";
import { resolveScope } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getVisualizationDetailFromCacheOrFetch } from "~/state/products/t2_visualization_detail";

type VisualizationSummary = Extract<ProductSummary, { type: "visualization" }>;

// A visualization's snapshot after its package or its scope changed: an
// editor who opens it brings it up to date, but nobody may, so the products
// list says so here. For a user who can edit, the badge is the update: the
// figure is re-resolved under the product's current pair (the same action as
// a deck's or a report's stale-figure badge) and saved; a failure says why
// and keeps the old snapshot. A viewer sees the badge only.
export function VisualizationStaleBadge(p: { product: ProductSummary }) {
  const stale = (): VisualizationSummary | undefined => {
    const product = p.product;
    if (product.type !== "visualization") return undefined;
    const current = resolveScope(productScope(product)).definitionHash;
    return isVisualizationStale(product, current) ? product : undefined;
  };
  return (
    <Show when={stale()} keyed>
      {(product) => <Badge product={product} />}
    </Show>
  );
}

function Badge(p: { product: VisualizationSummary }) {
  const [busy, setBusy] = createSignal(false);
  const canEdit = () => canEditProduct(p.product.id);
  const target = () =>
    `${packageLabel(p.product.runId)} · ${scopeLabel(p.product.scopeId)}`;
  const label = () =>
    t3({ en: "Out of date", fr: "Pas à jour", pt: "Desatualizada" });
  const title = () =>
    canEdit()
      ? t3({
        en:
          `Made from a different package or scope. Click to update it to ${target()}.`,
        fr:
          `Créée à partir d'un autre paquet ou d'une autre portée. Cliquez pour la mettre à jour vers ${target()}.`,
        pt:
          `Criada a partir de outro pacote ou âmbito. Clique para a atualizar para ${target()}.`,
      })
      : t3({
        en:
          `Made from a different package or scope than ${target()}. Someone who can edit it can update it.`,
        fr:
          `Créée à partir d'un autre paquet ou d'une autre portée que ${target()}. Une personne pouvant la modifier peut la mettre à jour.`,
        pt:
          `Criada a partir de outro pacote ou âmbito que ${target()}. Quem a pode editar pode atualizá-la.`,
      });

  async function update(e: MouseEvent) {
    // The row opens the visualization on click; the badge is its own action.
    e.stopPropagation();
    if (!canEdit() || busy()) return;
    setBusy(true);
    try {
      const reason = await updateToCurrentPair(p.product);
      if (reason !== undefined) {
        await openAlert({ text: reason, intent: "danger" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      class="ui-focusable border-warning text-warning flex h-[1lh] flex-none items-center gap-1 rounded border px-1.5 text-xs whitespace-nowrap"
      classList={{
        "ui-hoverable-base-100 cursor-pointer": canEdit(),
        "cursor-default": !canEdit(),
        "opacity-60": busy(),
      }}
      title={title()}
      aria-label={title()}
      disabled={busy()}
      onClick={(e) => void update(e)}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Icon iconName={busy() ? "loader" : "refresh"} />
      {label()}
    </button>
  );
}

// Re-resolve the stored figure under the product's current pair and save it.
// Undefined when it was saved; else why it could not be.
async function updateToCurrentPair(
  product: VisualizationSummary,
): Promise<string | undefined> {
  const pair = productScope(product);
  const detail = await getVisualizationDetailFromCacheOrFetch(product.id);
  if (!detail.success) return detail.err;
  const context = await getRunAuthoringContextFromCacheOrFetch(
    resolveScope(pair),
  );
  if (!context.success) return context.err;
  const resolved = await updateFigureToScope(
    pair,
    context.data,
    detail.data.bundle,
  );
  if (!resolved.ok) return resolved.reason;
  const saved = await serverActions.updateVisualization({
    product_id: product.id,
    bundle: resolved.bundle,
  });
  return saved.success ? undefined : saved.err;
}
