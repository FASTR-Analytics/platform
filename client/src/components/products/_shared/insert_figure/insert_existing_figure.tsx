import {
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type ProductSummary,
  type RunAuthoringContext,
  t3,
  type VisualizationDetail,
} from "lib";
import {
  type AlertComponentProps,
  Callout,
  createQuery,
  Input,
  LoadingIndicator,
  ModalContainer,
} from "panther";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { packageLabel, scopeLabel } from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import { getVisualizationDetailFromCacheOrFetch } from "~/state/products/t2_visualization_detail";
import type { InsertFigureResult } from "./insert_figure";
import { PresetPreview } from "./preset_preview";

// "Insert > Existing visualization": the saved visualizations the user can
// see, each previewed as it will look HERE, under the host's own package and
// scope. Picking one hands back `{ metric, config }` exactly as the wizard
// does, so the host resolves and stores it the same way: the figure is a
// copy, and later edits to the saved visualization do not reach it. One
// whose metric this package lacks is shown, and cannot be picked.

type Props = {
  scope: PackageScope;
  context: Pick<RunAuthoringContext, "metrics">;
};

type Pickable = { metric: MetricWithStatus; config: PresentationObjectConfig };

export function InsertExistingFigureModal(
  p: AlertComponentProps<Props, InsertFigureResult>,
) {
  const [search, setSearch] = createSignal("");
  const [selected, setSelected] = createSignal<
    { id: string; pick: Pickable } | undefined
  >();

  const saved = createMemo(() => {
    const q = search().trim().toLowerCase();
    return instanceState.products
      .filter((x) => x.type === "visualization")
      .filter((x) => q === "" || x.label.toLowerCase().includes(q))
      .toSorted((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  });
  const hasAny = () =>
    instanceState.products.some((x) => x.type === "visualization");

  function insert() {
    const pick = selected()?.pick;
    if (!pick) return;
    p.close({ metric: pick.metric, config: structuredClone(pick.config) });
  }

  return (
    <ModalContainer
      width="xl"
      pad="none"
      topPanel={
        <div class="ui-gap flex items-center justify-between">
          <div class="ui-text-heading">
            {t3({
              en: "Insert existing visualization",
              fr: "Insérer une visualisation existante",
              pt: "Inserir visualização existente",
            })}
          </div>
          <Show when={hasAny()}>
            <div class="w-64">
              <Input
                value={search()}
                onChange={setSearch}
                placeholder={t3({
                  en: "Search visualizations",
                  fr: "Rechercher des visualisations",
                  pt: "Pesquisar visualizações",
                })}
                fullWidth
              />
            </div>
          </Show>
        </div>
      }
      onCancel={() => p.close(undefined)}
      actions={[
        {
          label: t3({
            en: "Insert a copy",
            fr: "Insérer une copie",
            pt: "Inserir uma cópia",
          }),
          onClick: insert,
          disabled: selected() === undefined,
        },
      ]}
    >
      <div class="ui-pad ui-spy h-[min(36rem,60vh)] overflow-y-auto">
        <Show when={hasAny()}>
          <Callout intent="primary" pad="sm">
            <div class="font-700 text-sm">
              {t3({
                en: "This inserts a copy",
                fr: "Ceci insère une copie",
                pt: "Isto insere uma cópia",
              })}
            </div>
            <div class="text-sm">
              {t3({
                en:
                  "Changes you make to it here will not change the saved visualization, and later changes to the saved visualization will not change this copy.",
                fr:
                  "Les modifications que vous y apportez ici ne changeront pas la visualisation enregistrée, et les modifications ultérieures de la visualisation enregistrée ne changeront pas cette copie.",
                pt:
                  "As alterações que fizer aqui não alteram a visualização guardada, e as alterações posteriores à visualização guardada não alteram esta cópia.",
              })}
            </div>
          </Callout>
        </Show>
        <Switch>
          <Match when={!hasAny()}>
            <div class="text-base-content-muted text-sm">
              {t3({
                en:
                  "No saved visualizations yet. Make one on the Products page with New > New visualization.",
                fr:
                  "Aucune visualisation enregistrée pour le moment. Créez-en une sur la page Produits avec Nouveau > Nouvelle visualisation.",
                pt:
                  "Ainda não há visualizações guardadas. Crie uma na página Produtos com Novo > Nova visualização.",
              })}
            </div>
          </Match>
          <Match when={saved().length === 0}>
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "No matching visualizations",
                fr: "Aucune visualisation correspondante",
                pt: "Nenhuma visualização correspondente",
              })}
            </div>
          </Match>
          <Match when={true}>
            <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
              <For each={saved()}>
                {(product) => (
                  <SavedFigureCard
                    product={product}
                    scope={p.scope}
                    context={p.context}
                    selected={selected()?.id === product.id}
                    onSelect={(pick) => setSelected({ id: product.id, pick })}
                  />
                )}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
    </ModalContainer>
  );
}

function SavedFigureCard(p: {
  product: ProductSummary;
  scope: PackageScope;
  context: Pick<RunAuthoringContext, "metrics">;
  selected: boolean;
  onSelect: (pick: Pickable) => void;
}) {
  const detail = createQuery(() =>
    getVisualizationDetailFromCacheOrFetch(p.product.id)
  );
  const origin = () =>
    `${packageLabel(p.product.runId)} · ${scopeLabel(p.product.scopeId)}`;
  const pickable = (d: VisualizationDetail): Pickable | undefined => {
    const metric = p.context.metrics.find((m) => m.id === d.bundle.metricId);
    return metric && metric.status === "ready"
      ? { metric, config: d.bundle.config }
      : undefined;
  };

  return (
    <Switch>
      <Match
        when={detail.state().status === "ready" &&
          (detail.state() as { data: VisualizationDetail }).data}
        keyed
      >
        {(d) => (
          <Show
            when={pickable(d)}
            keyed
            fallback={
              <Unavailable
                label={p.product.label}
                text={t3({
                  en: "Its metric is not in this results package",
                  fr: "Son indicateur n'est pas dans ce paquet de résultats",
                  pt: "A sua métrica não está neste pacote de resultados",
                })}
              />
            }
          >
            {(pick) => (
              <PresetPreview
                scope={p.scope}
                metric={pick.metric}
                config={pick.config}
                label={p.product.label}
                description={origin()}
                selected={p.selected}
                onClick={() => p.onSelect(pick)}
              />
            )}
          </Show>
        )}
      </Match>
      <Match when={detail.state().status === "error"}>
        <Unavailable
          label={p.product.label}
          text={(detail.state() as { err: string }).err}
        />
      </Match>
      <Match when={true}>
        <div class="bg-base-100 row-span-2 flex aspect-video items-center justify-center rounded border">
          <LoadingIndicator />
        </div>
      </Match>
    </Switch>
  );
}

function Unavailable(p: { label: string; text: string }) {
  return (
    <div class="bg-base-100 row-span-2 grid grid-rows-subgrid rounded border opacity-60">
      <div class="p-2">
        <div class="bg-base-200 text-base-content-muted flex aspect-video items-center justify-center rounded p-2 text-center text-xs">
          {p.text}
        </div>
      </div>
      <div class="px-2 pb-2">
        <div class="font-700 text-xs">{p.label}</div>
      </div>
    </div>
  );
}
