import { ReplicantValueOverride, getTextRenderingOptions, t, t2, T } from "lib";
import { ADTFigure, ChartHolder, Loading, StateHolder } from "panther";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPOFigureInputsFromCacheOrFetch_AsyncGenerator } from "~/state/po_cache";

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
  const pds = useProjectDirtyStates();

  const [figureInputs, setFigureInputs] = createSignal<StateHolder<ADTFigure>>({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
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
    void pds.lastUpdated.presentation_objects[p.presentationObjectId];
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
  state: StateHolder<ADTFigure>;
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
  const pds = useProjectDirtyStates();
  const moduleDirtyStatus = () =>
    p.moduleId
      ? pds.moduleDirtyStates[p.moduleId]
      : "no_id_provided_which_is_ok";
  return (
    <Switch>
      <Match when={moduleDirtyStatus() === "running"}>
        <div class="text-success aspect-video text-xs" onClick={p.onClick}>
          {t("Module running...")}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "error"}>
        <div class="text-danger aspect-video text-xs" onClick={p.onClick}>
          {t("Module error")}
        </div>
      </Match>
      <Match when={moduleDirtyStatus() === "queued"}>
        <div class="aspect-video text-xs text-[orange]" onClick={p.onClick}>
          {t("Pending...")}
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
            <div class="text-danger aspect-video text-xs" onClick={p.onClick}>
              {(p.state as { err?: string }).err ?? "Error"}
            </div>
          </Match>
          <Match
            when={
              p.state.status === "ready" &&
              (p.state as { data: ADTFigure }).data
            }
            keyed
          >
            {(keyedFigureInputs) => {
              const h1 =
                //@ts-ignore
                keyedFigureInputs.style.idealAspectRatio === "none"
                  ? "flex"
                  : "ideal";
              return (
                <Switch>
                  <Match when={p.shapeType === "force-aspect-video"}>
                    <div class="aspect-video overflow-hidden">
                      <ChartHolder
                        chartInputs={keyedFigureInputs}
                        height={h1}
                        noRescaleWithWidthChange
                        textRenderingOptions={getTextRenderingOptions()}
                        scalePixelResolution={p.scalePixelResolution}
                      />
                    </div>
                  </Match>
                  <Match when={true}>
                    <ChartHolder
                      chartInputs={keyedFigureInputs}
                      height={"ideal"}
                      noRescaleWithWidthChange
                      textRenderingOptions={getTextRenderingOptions()}
                      scalePixelResolution={p.scalePixelResolution}
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
