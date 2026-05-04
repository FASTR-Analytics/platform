import { ReplicantValueOverride, t3 } from "lib";
import { FigureInputs, ChartHolder, Loading, StateHolder } from "panther";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import { projectState } from "~/state/project/t1_store";
import { getPOFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/po_cache";
import { NotAvailableBox } from "./NotAvailableBox";

type Props = {
  projectId: string;
  presentationObjectId: string;
  moduleId?: string;
  onClick?: () => void;
  shapeType: "ideal" | "force-aspect-video";
  repliantOverride?: ReplicantValueOverride;
  scalePixelResolution?: number;
};

export function PresentationObjectMiniDisplay(p: Props) {

  const [figureInputs, setFigureInputs] = createSignal<
    StateHolder<FigureInputs>
  >({
    status: "loading",
    msg: t3({ en: "Fetching data...", fr: "Récupération des données..." }),
  });

  async function attemptGetFigureInputs() {
    const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
      p.projectId,
      p.presentationObjectId,
      p.repliantOverride,
    );
    for await (const state of iter) {
      setFigureInputs(state);
    }
  }

  createEffect(() => {
    void projectState.lastUpdated.presentation_objects[p.presentationObjectId];
    attemptGetFigureInputs();
  });

  return (
    <PresentationObjectMiniDisplayStateHolderWrapper
      state={figureInputs()}
      moduleId={p.moduleId}
      shapeType={p.shapeType}
      onClick={p.onClick}
      scalePixelResolution={p.scalePixelResolution}
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
  scalePixelResolution?: number;
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
          })}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "error"}>
        <div class="text-danger aspect-video text-xs" onClick={p.onClick}>
          {t3({ en: "Module error", fr: "Erreur du module" })}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "queued"}>
        <div class="text-warning aspect-video text-xs" onClick={p.onClick}>
          {t3({ en: "Pending...", fr: "En attente..." })}
        </div>
      </Match>
      <Match when={true}>
        <Switch>
          <Match when={p.state.status === "loading"}>
            <div class="aspect-video text-xs" onClick={p.onClick}>
              <Loading msg={(p.state as { msg?: string }).msg} noPad={true} />
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
                  {err || t3({ en: "Error", fr: "Erreur" })}
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
                        noRescaleWithWidthChange
                        scalePixelResolution={p.scalePixelResolution}
                        renderError={renderError}
                      />
                    </div>
                  </Match>
                  <Match when={true}>
                    <ChartHolder
                      chartInputs={keyedFigureInputs}
                      height={h1}
                      noRescaleWithWidthChange
                      scalePixelResolution={p.scalePixelResolution}
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
