import {
  PresentationObjectConfig,
  PresentationObjectDetail,
  ProjectDetail,
  ResultsValueInfoForPresentationObject,
  t,
  t2,
  T,
} from "lib";
import { Match, Switch, createSignal } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { PresentationObjectEditorPanelData } from "./presentation_object_editor_panel_data";
import { PresentationObjectEditorPanelStyle } from "./presentation_object_editor_panel_style";
import { PresentationObjectEditorPanelText } from "./presentation_object_editor_panel_text";

type Props = {
  projectDetail: ProjectDetail;
  poDetail: PresentationObjectDetail;
  resultsValueInfo: ResultsValueInfoForPresentationObject;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  viewResultsObject: (resultsObjectId: string) => Promise<void>;
};

export function PresentationObjectEditorPanel(p: Props) {
  const [tab, setTab] = createSignal<"data" | "style" | "text">("data");

  return (
    <div class="flex h-full w-full flex-col">
      <div class="flex w-full flex-none border-b">
        <div
          class="ui-hoverable flex-1 border-r py-2 text-center data-[selected=true]:bg-base-200"
          onClick={() => setTab("data")}
          data-selected={tab() === "data"}
        >
          {t2(T.FRENCH_UI_STRINGS.data)}
        </div>
        <div
          class="ui-hoverable flex-1 border-r py-2 text-center data-[selected=true]:bg-base-200"
          onClick={() => setTab("style")}
          data-selected={tab() === "style"}
        >
          {t2(T.FRENCH_UI_STRINGS.presentation)}
        </div>
        <div
          class="ui-hoverable flex-1 py-2 text-center data-[selected=true]:bg-base-200"
          onClick={() => setTab("text")}
          data-selected={tab() === "text"}
        >
          {t2(T.FRENCH_UI_STRINGS.text)}
        </div>
      </div>
      <div class="h-0 w-full flex-1">
        <Switch>
          <Match when={tab() === "data"}>
            <PresentationObjectEditorPanelData
              projectDetail={p.projectDetail}
              poDetail={p.poDetail}
              resultsValueInfo={p.resultsValueInfo}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
              viewResultsObject={p.viewResultsObject}
            />
          </Match>
          <Match when={tab() === "style"}>
            <PresentationObjectEditorPanelStyle
              projectId={p.projectDetail.id}
              poDetail={p.poDetail}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
            />
          </Match>
          <Match when={tab() === "text"}>
            <PresentationObjectEditorPanelText
              projectId={p.projectDetail.id}
              poDetail={p.poDetail}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
            />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
