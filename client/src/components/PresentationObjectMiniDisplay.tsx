import { ReplicantValueOverride, t3 } from "lib";
import { FigureInputs, ChartHolder, LoadingIndicator, StateHolder } from "panther";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import {
  datasetsVersionKey,
  moduleDataVersionKey,
  projectState,
} from "~/state/project/t1_store";
import { getPOFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/project/t2_presentation_objects";
import { NotAvailableBox } from "./NotAvailableBox";

type Props = {
  projectId: string;
  presentationObjectId: string;
  moduleId?: string;
  onClick?: () => void;
  shapeType: "ideal" | "force-aspect-video";
  repliantOverride?: ReplicantValueOverride;
};

export function PresentationObjectMiniDisplay(p: Props) {

  const [figureInputs, setFigureInputs] = createSignal<
    StateHolder<FigureInputs>
  >({
    status: "loading",
    msg: t3({ en: "Fetching data...", fr: "Récupération des données...", pt: "A obter dados..." }),
  });

  // Monotonic run id: two effect re-runs (PO last_updated bursts) race their
  // generator loops, and the older one can commit its stale state last — the
  // guard sits INSIDE the loop because the generator yields multiple times
  // (same idiom as visualization_editor_inner's itemsFetchRunId).
  let fetchRunId = 0;
  async function attemptGetFigureInputs() {
    const runId = ++fetchRunId;
    const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
      p.projectId,
      p.presentationObjectId,
      p.repliantOverride,
    );
    for await (const state of iter) {
      if (runId !== fetchRunId) {
        return;
      }
      setFigureInputs(state);
    }
  }

  createEffect(() => {
    void projectState.lastUpdated.presentation_objects[p.presentationObjectId];
    // Tracked version-key read so mounted thumbnails refetch when module
    // output or dataset integration changes (the caches this renders through
    // version on it, and cache-internal reads are untracked).
    if (p.moduleId) {
      moduleDataVersionKey(projectState, p.moduleId);
    } else {
      datasetsVersionKey(projectState);
    }
    attemptGetFigureInputs();
  });

  return (
    <PresentationObjectMiniDisplayStateHolderWrapper
      state={figureInputs()}
      moduleId={p.moduleId}
      shapeType={p.shapeType}
      onClick={p.onClick}
    />
  );
}

// Render an ALREADY-RESOLVED FigureInputs as a thumbnail — identical rendering
// to the presentation-object mini display (zoom, aspect-video, table-aware
// height, NotAvailableBox errors), but for snapshotted figures that have no
// live presentation-object id (e.g. dashboard items).
export function FigureThumbnail(p: {
  figureInputs: FigureInputs;
  shapeType?: "ideal" | "force-aspect-video";
  onClick?: () => void;
}) {
  return (
    <PresentationObjectMiniDisplayStateHolderWrapper
      state={{ status: "ready", data: p.figureInputs }}
      shapeType={p.shapeType ?? "force-aspect-video"}
      onClick={p.onClick}
    />
  );
}

type PresentationObjectMiniDisplayStateHolderWrapperProps = {
  state: StateHolder<FigureInputs>;
  moduleId?: string;
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

function PresentationObjectMiniDisplayStateHolderWrapper(
  p: PresentationObjectMiniDisplayStateHolderWrapperProps,
) {
  const moduleDirtyStatus = () => {
    try {
      const mid = p.moduleId;
      return mid ? projectState.moduleDirtyStates[mid] : "no_id_provided_which_is_ok";
    } catch {
      return "no_id_provided_which_is_ok";
    }
  };
  return (
    <Switch>
      <Match when={moduleDirtyStatus() === "running"}>
        <div class="text-success aspect-video text-xs" onClick={p.onClick}>
          {t3({
            en: "Module running...",
            fr: "Module en cours d'exécution...",
            pt: "Módulo em execução...",
          })}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "error"}>
        <div class="text-danger aspect-video text-xs" onClick={p.onClick}>
          {t3({ en: "Module error", fr: "Erreur du module", pt: "Erro do módulo" })}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "queued"}>
        <div class="text-warning aspect-video text-xs" onClick={p.onClick}>
          {t3({ en: "Pending...", fr: "En attente...", pt: "Pendente..." })}
        </div>
      </Match>
      <Match when={true}>
        <Switch>
          <Match when={p.state.status === "loading"}>
            <div class="aspect-video text-xs" onClick={p.onClick}>
              <LoadingIndicator msg={(p.state as { msg?: string }).msg} noPad={true} />
            </div>
          </Match>
          <Match when={p.state.status === "error"}>
            {(() => {
              const err = (p.state as { err?: string }).err ?? "";
              const isKnown = err.startsWith("[INFO] ");
              if (isKnown) {
                return (
                  <NotAvailableBox err={err.slice(7)} onClick={p.onClick} />
                );
              }
              return (
                <div
                  class="text-danger aspect-video text-xs"
                  onClick={p.onClick}
                >
                  {err || t3({ en: "Error", fr: "Erreur", pt: "Erro" })}
                </div>
              );
            })()}
          </Match>
          <Match
            when={
              p.state.status === "ready" &&
              (p.state as { data: FigureInputs }).data
            }
            keyed
          >
            {(keyedFigureInputs) => {
              const h1 =
                "tableData" in keyedFigureInputs
                  ? ("ideal" as const)
                  : ("flex" as const);
              const renderError = (err: string) => (
                <NotAvailableBox err={err} />
              );
              return (
                <Switch>
                  <Match when={p.shapeType === "force-aspect-video"}>
                    <div class="aspect-video overflow-hidden">
                      <ChartHolder
                        chartInputs={keyedFigureInputs}
                        height={h1}
                        sizing="zoom"
                        renderError={renderError}
                      />
                    </div>
                  </Match>
                  <Match when={true}>
                    <ChartHolder
                      chartInputs={keyedFigureInputs}
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
      </Match>
    </Switch>
  );
}
