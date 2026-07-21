import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  type PresenceEntry,
  ProjectState,
  ResultsValueInfoForPresentationObject,
  getEffectivePOConfig,
  getPeriodFilterExactBounds,
  getSingleValueDimsFromPossibleValues,
  t3,
} from "lib";
import { Match, Show, Switch, createSignal } from "solid-js";
import { PresenceAvatars } from "~/components/slide_deck/presence_avatars";
import { SetStoreFunction } from "solid-js/store";
import { PresentationObjectEditorPanelData } from "./presentation_object_editor_panel_data";
import { PresentationObjectEditorPanelStyle } from "./presentation_object_editor_panel_style";
import {
  PresentationObjectEditorPanelText,
  type VizCaptionCollab,
} from "./presentation_object_editor_panel_text";

type Props = {
  projectStateSnapshot: ProjectState;
  poDetail: PresentationObjectDetail;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  viewResultsObject: (resultsObjectId: string) => Promise<void>;
  /** When live-collab is bound, caption fields use CodeMirror (remote carets);
   *  undefined → plain TextArea fallback. */
  captionCollab?: VizCaptionCollab;
  /** Notifies the host which tab is active (live-cursor tab gating). */
  onTabChange?: (tab: "data" | "style" | "text") => void;
  /** Collaborators currently on each tab (live), for per-tab avatars. */
  tabPeers?: Record<"data" | "style" | "text", PresenceEntry[]>;
};

// One panel tab: label + live avatars of collaborators currently ON that tab.
function TabButton(tp: {
  label: string;
  selected: boolean;
  peers?: PresenceEntry[];
  onClick: () => void;
  borderRight?: boolean;
}) {
  return (
    <div
      class="ui-hoverable-base-100 data-[selected=true]:bg-base-200 flex-1 px-2 py-2"
      classList={{ "border-r": tp.borderRight }}
      onClick={tp.onClick}
      data-selected={tp.selected}
    >
      <div class="flex items-center justify-center gap-1.5">
        <span class="truncate">{tp.label}</span>
        <Show when={(tp.peers?.length ?? 0) > 0}>
          <PresenceAvatars peers={tp.peers!} size="sm" max={3} />
        </Show>
      </div>
    </div>
  );
}

export function PresentationObjectEditorPanel(p: Props) {
  const [tab, setTab] = createSignal<"data" | "style" | "text">("data");
  function switchTab(t: "data" | "style" | "text") {
    setTab(t);
    p.onTabChange?.(t);
  }

  const resolvedPeriodBounds = () => {
    const pf = p.tempConfig.d.periodFilter;
    if (!pf) return undefined;
    return getPeriodFilterExactBounds(pf, p.resultsValueInfo.periodBounds);
  };

  const singleValueDims = () =>
    getSingleValueDimsFromPossibleValues(
      p.resultsValueInfo.disaggregationPossibleValues,
    );

  const effectivePOConfigResult = () => {
    return getEffectivePOConfig(p.tempConfig, {
      dateRange: resolvedPeriodBounds(),
      valueProps: p.poDetail.resultsValue.valueProps,
      singleValueDims: singleValueDims(),
    });
  };

  return (
    <div
      id="VIZ_PANEL_ROOT"
      class="flex h-full w-full flex-col border-r"
      data-cursor-zone="panel"
    >
      <div class="flex w-full flex-none border-b">
        <TabButton
          label={t3({ en: "Data", fr: "Données", pt: "Dados" })}
          selected={tab() === "data"}
          peers={p.tabPeers?.data}
          onClick={() => switchTab("data")}
          borderRight
        />
        <TabButton
          label={t3({ en: "Presentation", fr: "Présentation", pt: "Apresentação" })}
          selected={tab() === "style"}
          peers={p.tabPeers?.style}
          onClick={() => switchTab("style")}
          borderRight
        />
        <TabButton
          label={t3({ en: "Text", fr: "Texte", pt: "Texto" })}
          selected={tab() === "text"}
          peers={p.tabPeers?.text}
          onClick={() => switchTab("text")}
        />
      </div>
      <div class="h-0 w-full flex-1">
        <Switch>
          <Match when={tab() === "data"}>
            <PresentationObjectEditorPanelData
              projectStateSnapshot={p.projectStateSnapshot}
              poDetail={p.poDetail}
              resultsValueInfo={p.resultsValueInfo}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
              viewResultsObject={p.viewResultsObject}
              singleValueDims={singleValueDims()}
              ineffectiveDisaggregators={effectivePOConfigResult().ineffectiveDisaggregators}
              effectiveValueProps={effectivePOConfigResult().effectiveValueProps}
              hasMultipleValueProps={effectivePOConfigResult().hasMultipleValueProps}
            />
          </Match>
          <Match when={tab() === "style"}>
            <PresentationObjectEditorPanelStyle
              projectId={p.projectStateSnapshot.id}
              poDetail={p.poDetail}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
              effectiveConfig={effectivePOConfigResult().config}
              effectiveValueProps={effectivePOConfigResult().effectiveValueProps}
            />
          </Match>
          <Match when={tab() === "text"}>
            <PresentationObjectEditorPanelText
              projectId={p.projectStateSnapshot.id}
              poDetail={p.poDetail}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
              captionCollab={p.captionCollab}
            />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
