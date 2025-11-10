import { ProjectDirtyStates, ReportType, getTextRenderingOptions } from "lib";
import {
  Loading,
  PageHolder,
  PageInputs,
  StateHolder,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import { Match, Switch, createEffect, createSignal, onMount } from "solid-js";
import { unwrap } from "solid-js/store";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { getPageInputsFromCacheOrFetch } from "~/state/ri_cache";

type Props = {
  projectId: string;
  reportId: string;
  reportItemId: string;
  reportType: ReportType;
  onClick?: () => void;
  scalePixelResolution?: number;
};

export function ReportItemMiniDisplay(p: Props) {
  const pds = useProjectDirtyStates();

  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Loading...",
  });

  // Sub-state updater

  async function attemptGetPageInputs() {
    const res = await getPageInputsFromCacheOrFetch(
      p.projectId,
      p.reportId,
      p.reportItemId,
    );
    if (res.success === false) {
      setPageInputs({ status: "error", err: res.err });
      return;
    }
    setPageInputs({ status: "ready", data: res.data.pageInputs });
  }

  onMount(() => {
    const unwrappedPDS = unwrap(pds);
    attemptGetPageInputs();
  });

  let firstRun = true;
  createEffect(() => {
    const _lastUpdatedReport = pds.lastUpdated.reports[p.reportId] ?? "unknown";
    const _lastUpdatedReportItem =
      pds.lastUpdated.report_items[p.reportItemId] ?? "unknown";
    // trackDeep(pds.lastUpdated.presentation_objects);
    if (firstRun) {
      firstRun = false;
      return;
    }
    console.log("Re-fetching slide inputs");
    // console.log(
    //   "TIM OPTIMIZE THIS TO ONLY RE-RUN WHEN AFFECTED POs ARE CHANGED (2)",
    // );
    const unwrappedPDS = unwrap(pds);
    attemptGetPageInputs();
  });

  return (
    <ReportItemMiniDisplayStateHolderWrapper
      state={pageInputs()}
      onClick={p.onClick}
      reportType={p.reportType}
      scalePixelResolution={p.scalePixelResolution}
    />
  );
}

type ReportItemMiniDisplayStateHolderWrapperProps = {
  state: StateHolder<PageInputs>;
  reportType: ReportType;
  onClick?: () => void;
  scalePixelResolution?: number;
};

export function ReportItemMiniDisplayStateHolderWrapper(
  p: ReportItemMiniDisplayStateHolderWrapperProps,
) {
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <div
          class="aspect-video p-1.5 text-xs data-[policyBrief=true]:aspect-[210/297]"
          onClick={p.onClick}
          data-policyBrief={p.reportType === "policy_brief"}
        >
          <Loading msg={(p.state as { msg?: string }).msg} noPad={true} />
        </div>
      </Match>
      <Match when={p.state.status === "error"}>
        <PageHolder
          pageInputs={undefined}
          fixedCanvasH={
            p.reportType === "policy_brief"
              ? Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 297) / 210)
              : Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)
          }
          textRenderingOptions={getTextRenderingOptions()}
          simpleError
          externalError={(p.state as { err?: string }).err}
          scalePixelResolution={p.scalePixelResolution}
        />
      </Match>
      <Match
        when={
          p.state.status === "ready" && (p.state as { data: PageInputs }).data
        }
        keyed
      >
        {(keyedPageInputs) => {
          return (
            <PageHolder
              pageInputs={keyedPageInputs}
              fixedCanvasH={
                p.reportType === "policy_brief"
                  ? Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 297) / 210)
                  : Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)
              }
              textRenderingOptions={getTextRenderingOptions()}
              simpleError
              scalePixelResolution={p.scalePixelResolution}
            />
          );
        }}
      </Match>
    </Switch>
  );
}
