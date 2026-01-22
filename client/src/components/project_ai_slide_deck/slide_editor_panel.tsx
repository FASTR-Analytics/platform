import {
  ProjectDetail,
  ReportItemConfig,
  ReportItemType,
  get_REPORT_ITEM_TYPE_SELECT_OPTIONS,
  getStartingConfigForReport,
} from "lib";
import { Button, OpenEditorProps, Select } from "panther";
import { Match, Setter, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { ReportItemEditorContent } from "../report/report_item_editor_panel_content";
import { ReportItemEditorSlideCover } from "../report/report_item_editor_panel_slide_cover";
import { ReportItemEditorSlideHeaderFooter } from "../report/report_item_editor_panel_slide_header_footer";
import { ReportItemEditorSlideSection } from "../report/report_item_editor_panel_slide_section";

type Props = {
  projectDetail: ProjectDetail;
  reportId: string;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  selectedItemId: string | undefined;
  setSelectedItemId: Setter<string | undefined>;
  onSave: () => void;
  onCancel: () => void;
  hasUnsavedChanges: boolean;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
};

export function SlideEditorPanel(p: Props) {
  // Create minimal reportDetail for child components
  const dummyReportDetail = {
    id: p.reportId,
    projectId: p.projectDetail.id,
    reportType: "slide_deck" as const,
    config: getStartingConfigForReport(""),
    itemIdsInOrder: [],
    lastUpdated: "",
  };

  return (
    <div class="flex h-full flex-col overflow-auto">
      {/* Save/Cancel buttons */}
      <div class="ui-pad border-b border-base-300">
        <div class="flex gap-2">
          <Button
            onClick={p.onSave}
            disabled={!p.hasUnsavedChanges}
            intent="primary"
          >
            Save
          </Button>
          <Button
            onClick={p.onCancel}
            outline
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Type selector */}
      <div class="ui-pad border-b border-base-300">
        <Select
          label="Slide Type"
          options={get_REPORT_ITEM_TYPE_SELECT_OPTIONS()}
          value={p.tempReportItemConfig.type}
          onChange={(v) => p.setTempReportItemConfig("type", v as ReportItemType)}
        />
      </div>

      {/* Type-specific panels - reuse existing components */}
      <div class="flex-1 overflow-auto">
        <Switch>
          <Match when={p.tempReportItemConfig.type === "cover"}>
            <ReportItemEditorSlideCover
              projectId={p.projectDetail.id}
              tempReportItemConfig={p.tempReportItemConfig}
              setTempReportItemConfig={p.setTempReportItemConfig}
              reportDetail={dummyReportDetail}
            />
          </Match>
          <Match when={p.tempReportItemConfig.type === "section"}>
            <ReportItemEditorSlideSection
              projectId={p.projectDetail.id}
              tempReportItemConfig={p.tempReportItemConfig}
              setTempReportItemConfig={p.setTempReportItemConfig}
              reportDetail={dummyReportDetail}
            />
          </Match>
          <Match when={p.tempReportItemConfig.type === "freeform"}>
            <ReportItemEditorSlideHeaderFooter
              projectId={p.projectDetail.id}
              tempReportItemConfig={p.tempReportItemConfig}
              setTempReportItemConfig={p.setTempReportItemConfig}
              reportDetail={dummyReportDetail}
            />
            <ReportItemEditorContent
              projectDetail={p.projectDetail}
              tempReportItemConfig={p.tempReportItemConfig}
              setTempReportItemConfig={p.setTempReportItemConfig}
              reportDetail={dummyReportDetail}
              openEditor={p.openEditor}
              selectedItemId={p.selectedItemId}
              setSelectedItemId={p.setSelectedItemId}
            />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
