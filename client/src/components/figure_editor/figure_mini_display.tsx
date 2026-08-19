import {
  PackageScope,
  PresentationObjectConfig,
  ReplicantValueOverride,
  ResultsValue,
  t3,
} from "lib";
import {
  FigureInputs,
  FigureHolder,
  LoadingIndicator,
  StateHolder,
} from "panther";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import { getFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/products/t2_figure_data";
import { NotAvailableBox } from "../NotAvailableBox";

type Props = {
  scope: PackageScope;
  metric: ResultsValue;
  config: PresentationObjectConfig;
  onClick?: () => void;
  shapeType: "ideal" | "force-aspect-video";
  replicantOverride?: ReplicantValueOverride;
};

// A live thumbnail of `{ metricId, config }` resolved under one PackageScope —
// the preset gallery, the Explore cards, any small preview that is not the
// editor. There is no per-id detail read behind it any more: a figure is not a
// row (D3), so the caller supplies the metric from the run's authoring context.
export function FigureMiniDisplay(p: Props) {
  const [figureInputs, setFigureInputs] = createSignal<
    StateHolder<FigureInputs>
  >({
    status: "loading",
    msg: t3({
      en: "Fetching data...",
      fr: "Récupération des données...",
      pt: "A obter dados...",
    }),
  });

  // Monotonic run id: two effect re-runs race their generator loops, and the
  // older one can commit its stale state last — the guard sits INSIDE the loop
  // because the generator yields multiple times (same idiom as the editor's
  // itemsFetchRunId).
  let fetchRunId = 0;
  async function attemptGetFigureInputs(
    scope: PackageScope,
    metric: ResultsValue,
    config: PresentationObjectConfig,
    replicantOverride: ReplicantValueOverride | undefined,
  ) {
    const runId = ++fetchRunId;
    const iter = getFigureInputsFromCacheOrFetch_AsyncGenerator(
      scope,
      metric,
      config,
      replicantOverride,
    );
    for await (const state of iter) {
      if (runId !== fetchRunId) {
        return;
      }
      setFigureInputs(state);
    }
  }

  // Tracked reads before the first await. The pair is part of the cache's
  // UNIQUENESS key, not a version key, so re-reading it here is the whole
  // invalidation story: a reattach moves the entry, this effect re-runs, and
  // the thumbnail refetches under the new package.
  createEffect(() => {
    attemptGetFigureInputs(
      { runId: p.scope.runId, adminArea2: p.scope.adminArea2 },
      p.metric,
      p.config,
      p.replicantOverride,
    );
  });

  return (
    <FigureMiniDisplayStateHolderWrapper
      state={figureInputs()}
      shapeType={p.shapeType}
      onClick={p.onClick}
    />
  );
}

// Render an ALREADY-RESOLVED FigureInputs as a thumbnail — identical rendering
// to the live mini display (zoom, aspect-video, table-aware height,
// NotAvailableBox errors), but for snapshotted figures (a stored bundle in a
// slide card, a version preview) that resolve nothing at display time.
export function FigureThumbnail(p: {
  figureInputs: FigureInputs;
  shapeType?: "ideal" | "force-aspect-video";
  onClick?: () => void;
}) {
  return (
    <FigureMiniDisplayStateHolderWrapper
      state={{ status: "ready", data: p.figureInputs }}
      shapeType={p.shapeType ?? "force-aspect-video"}
      onClick={p.onClick}
    />
  );
}

type FigureMiniDisplayStateHolderWrapperProps = {
  state: StateHolder<FigureInputs>;
  onErrorButton?:
    | {
        label: string;
        onClick: () => void;
      }
    | {
        label: string;
        link: string;
      };
  onClick?: () => void;
  shapeType: "ideal" | "force-aspect-video";
};

function FigureMiniDisplayStateHolderWrapper(
  p: FigureMiniDisplayStateHolderWrapperProps,
) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div class="aspect-video text-xs" onClick={p.onClick}>
          <LoadingIndicator
            msg={(p.state as { msg?: string }).msg}
            noPad={true}
          />
        </div>
      </Match>
      <Match when={p.state.status === "error"}>
        {(() => {
          const err = (p.state as { err?: string }).err ?? "";
          const isKnown = err.startsWith("[INFO] ");
          if (isKnown) {
            return <NotAvailableBox err={err.slice(7)} onClick={p.onClick} />;
          }
          return (
            <div class="text-danger aspect-video text-xs" onClick={p.onClick}>
              {err || t3({ en: "Error", fr: "Erreur", pt: "Erro" })}
            </div>
          );
        })()}
      </Match>
      <Match
        when={
          p.state.status === "ready" && (p.state as { data: FigureInputs }).data
        }
        keyed
      >
        {(keyedFigureInputs) => {
          const h1 =
            keyedFigureInputs.figureType === "table"
              ? ("ideal" as const)
              : ("flex" as const);
          const renderError = (err: string) => <NotAvailableBox err={err} />;
          return (
            <Switch>
              <Match when={p.shapeType === "force-aspect-video"}>
                <div class="aspect-video overflow-hidden">
                  <FigureHolder
                    figureInputs={keyedFigureInputs}
                    height={h1}
                    sizing="zoom"
                    renderError={renderError}
                  />
                </div>
              </Match>
              <Match when={true}>
                <FigureHolder
                  figureInputs={keyedFigureInputs}
                  height={h1}
                  sizing="zoom"
                  renderError={renderError}
                />
              </Match>
            </Switch>
          );
        }}
      </Match>
    </Switch>
  );
}
