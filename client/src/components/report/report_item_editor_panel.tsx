import {
  ProjectDetail,
  ReportDetail,
  ReportItemConfig,
  ReportItemType,
  T,
  get_REPORT_ITEM_TYPE_SELECT_OPTIONS,
  t,
  t2
} from "lib";
import {
  Button,
  ButtonGroup,
  OpenEditorProps,
  Select,
  TimActionButton,
  openAlert,
  openComponent,
  timActionDelete,
} from "panther";
import { Match, Setter, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  headerOrContent,
  policyHeaderOrContent,
  setHeaderOrContent,
  setPolicyHeaderOrContent,
} from "~/state/ui";
import { DuplicateReportItem } from "./duplicate_report_item";
import { ReportItemEditorContent } from "./report_item_editor_panel_content";
import { ReportItemEditorPolicyHeaderFooter } from "./report_item_editor_panel_policy_header_footer";
import { ReportItemEditorSlideCover } from "./report_item_editor_panel_slide_cover";
import { ReportItemEditorSlideHeaderFooter } from "./report_item_editor_panel_slide_header_footer";
import { ReportItemEditorSlideSection } from "./report_item_editor_panel_slide_section";

type Props = {
  projectDetail: ProjectDetail;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  reportDetail: ReportDetail;
  save: TimActionButton<[]>;
  saveStatus: "saved" | "pending" | "saving" | "error";
  saveError: string;
  setSelectedItemId: (id: string | undefined) => void;
  reportItemId: string;
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  selectedItemId: string | undefined;
  setSelectedItemId2: Setter<string | undefined>;
};

export function ReportItemEditorPanel(p: Props) {
  async function attemptDeleteReportItem() {
    const deleteAction = timActionDelete(
      `${t2(T.FRENCH_UI_STRINGS.are_you_sure_you_want_to_delet)} ${p.reportDetail.reportType === "slide_deck" ? t2(T.FRENCH_UI_STRINGS.slide) : t2(T.FRENCH_UI_STRINGS.page)}?`,
      async () => {
        const res = await serverActions.deleteReportItem({
          projectId: p.projectDetail.id,
          report_id: p.reportDetail.id,
          item_id: p.reportItemId,
        });
        // if (res.success === false) {
        //   return res;
        // }
        // await p.silentFetchReportItem(res.data.lastUpdated);
        // optimisticSetLastUpdated(p.reportDetail.id, res.data.lastUpdated);
        return res;
      },
      () => p.setSelectedItemId(undefined),
    );

    await deleteAction.click();
  }

  async function duplicate() {
    if (p.saveStatus === "pending" || p.saveStatus === "saving") {
      await openAlert({
        text:
          p.reportDetail.reportType === "slide_deck"
            ? t(
              "In order to be duplicated, slides cannot have any unsaved changes",
            )
            : t(
              "In order to be duplicated, pages cannot have any unsaved changes",
            ),
      });
      return;
    }
    const res = await openComponent({
      element: DuplicateReportItem,
      props: {
        projectDetail: p.projectDetail,
        reportId: p.reportDetail.id,
        reportItemId: p.reportItemId,
        reportType: p.reportDetail.reportType,
      },
    });
    if (res === undefined) {
      return;
    }
    if (res.thisOrOtherReport === "other_report") {
      return;
    }
    p.setSelectedItemId(res.newReportItemId);
  }

  return (
    <div class="bg-base-100 flex h-full w-full flex-col overflow-auto">
      <div class="ui-spy-sm flex-none px-4 pt-4">
        <div class="ui-gap-sm flex items-center">
          <div class="flex items-center gap-2 text-sm">
            <Switch>
              <Match when={p.saveStatus === "saved"}>
                <span class="text-success">{t2(T.Reports.saved)} ✓</span>
              </Match>
              <Match when={p.saveStatus === "pending"}>
                <span class="text-neutral">{t("Saving soon...")}</span>
              </Match>
              <Match when={p.saveStatus === "saving"}>
                <span class="text-primary animate-pulse">{t("Saving...")}</span>
              </Match>
              <Match when={p.saveStatus === "error"}>
                <span class="text-danger" title={p.saveError}>
                  ⚠ {t("Save failed")}
                </span>
              </Match>
            </Switch>
          </div>
          <div class="flex-1"></div>
          <Button onClick={duplicate} outline iconName="copy">
            {/* {t2(T.FRENCH_UI_STRINGS.duplicate)} */}
          </Button>
          <Button
            onClick={attemptDeleteReportItem}
            // intent="danger"
            outline
            iconName="trash"
          >
            {/* {t2(T.FRENCH_UI_STRINGS.delete)} */}
          </Button>
        </div>
        <Show when={p.reportDetail.reportType === "slide_deck"}>
          <div class="">
            <Select
              label={t2(T.FRENCH_UI_STRINGS.slide_type)}
              options={get_REPORT_ITEM_TYPE_SELECT_OPTIONS()}
              value={p.tempReportItemConfig.type}
              onChange={(v) =>
                p.setTempReportItemConfig("type", v as ReportItemType)
              }
              fullWidth
            />
          </div>
        </Show>
      </div>

      <Switch>
        <Match when={p.reportDetail.reportType === "slide_deck"}>
          <Switch>
            <Match when={p.tempReportItemConfig.type === "cover"}>
              {/* <div class="m-4 flex-none select-none border bg-base-200 py-2 text-center">
                {t2(T.FRENCH_UI_STRINGS.cover)}
              </div> */}
              <ReportItemEditorSlideCover
                projectId={p.projectDetail.id}
                tempReportItemConfig={p.tempReportItemConfig}
                setTempReportItemConfig={p.setTempReportItemConfig}
                reportDetail={p.reportDetail}
              />
            </Match>
            <Match when={p.tempReportItemConfig.type === "section"}>
              {/* <div class="m-4 flex-none select-none border bg-base-200 py-2 text-center">
                {t2(T.FRENCH_UI_STRINGS.section)}
              </div> */}
              <ReportItemEditorSlideSection
                projectId={p.projectDetail.id}
                tempReportItemConfig={p.tempReportItemConfig}
                setTempReportItemConfig={p.setTempReportItemConfig}
                reportDetail={p.reportDetail}
              />
            </Match>
            <Match when={p.tempReportItemConfig.type === "freeform"}>
              <div class="mt-4 w-full flex-none px-4">
                <ButtonGroup
                  value={headerOrContent()}
                  onChange={setHeaderOrContent}
                  options={[
                    { label: t2(T.FRENCH_UI_STRINGS.content), value: "content" },
                    { label: t2(T.FRENCH_UI_STRINGS.header__footer), value: "slideHeader" },
                  ]}
                  fullWidth
                />
              </div>
              <div class="h-0 flex-1">
                <Switch>
                  <Match when={headerOrContent() === "slideHeader"}>
                    <ReportItemEditorSlideHeaderFooter
                      projectId={p.projectDetail.id}
                      tempReportItemConfig={p.tempReportItemConfig}
                      setTempReportItemConfig={p.setTempReportItemConfig}
                      reportDetail={p.reportDetail}
                    />
                  </Match>
                  <Match when={true}>
                    <ReportItemEditorContent
                      projectDetail={p.projectDetail}
                      tempReportItemConfig={p.tempReportItemConfig}
                      setTempReportItemConfig={p.setTempReportItemConfig}
                      reportDetail={p.reportDetail}
                      openEditor={p.openEditor}
                      selectedItemId={p.selectedItemId}
                      setSelectedItemId={p.setSelectedItemId2}
                    />
                  </Match>
                </Switch>
              </div>
            </Match>
          </Switch>
        </Match>
        <Match when={p.reportDetail.reportType === "policy_brief"}>
          <div class="my-4 w-full flex-none px-4">
            <ButtonGroup
              value={policyHeaderOrContent()}
              onChange={setPolicyHeaderOrContent}
              options={[
                { label: t2(T.FRENCH_UI_STRINGS.content), value: "content" },
                {
                  label: t2(T.FRENCH_UI_STRINGS.header__footer),
                  value: "policyHeaderFooter",
                },
              ]}
              fullWidth
            />
          </div>
          <div class="h-0 flex-1">
            <Switch>
              <Match when={policyHeaderOrContent() === "policyHeaderFooter"}>
                <ReportItemEditorPolicyHeaderFooter
                  projectId={p.projectDetail.id}
                  tempReportItemConfig={p.tempReportItemConfig}
                  setTempReportItemConfig={p.setTempReportItemConfig}
                  reportDetail={p.reportDetail}
                />
              </Match>
              <Match when={true}>
                <ReportItemEditorContent
                  projectDetail={p.projectDetail}
                  tempReportItemConfig={p.tempReportItemConfig}
                  setTempReportItemConfig={p.setTempReportItemConfig}
                  reportDetail={p.reportDetail}
                  openEditor={p.openEditor}
                  selectedItemId={p.selectedItemId}
                  setSelectedItemId={p.setSelectedItemId2}
                />
              </Match>
            </Switch>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
