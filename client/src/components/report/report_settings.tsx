import { ColorTheme,
  ReportConfig,
  ReportType,
  _COLOR_THEMES,
  getColorDetailsForColorTheme,
  isFrench, t2, T } from "lib";
import {
  Button,
  Checkbox,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  Select,
  SettingsSection,
  StateHolderWrapper,
  getSelectOptions,
  timActionDelete,
  timActionButton,
  timQuery,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { t } from "lib";

const __U = "__UNDEFINED";

type Props = EditorComponentProps<
  {
    projectId: string;
    reportId: string;
    reportType: ReportType;
    reportConfig: ReportConfig;
    silentGetReportDetail: (lastUpdate: string) => Promise<void>;
  },
  "AFTER_DELETE_BACK_TO_PROJECT_WITH_PROJECT_UPDATE"
>;

export function ReportSettings(p: Props) {
  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t2(T.FRENCH_UI_STRINGS.loading_files),
  );

  const [tempConfig, setTempConfig] = createStore<ReportConfig>(
    structuredClone(p.reportConfig),
  );

  function addLogo() {
    setTempConfig("logos", (prev) =>
      prev === undefined ? [""] : [...prev, ""],
    );
  }

  function removeLogo(index: number) {
    setTempConfig("logos", (prev) =>
      prev === undefined ? [] : prev.toSpliced(index, 1),
    );
  }

  const save = timActionButton(
    async () => {
      const newConfig = unwrap(tempConfig);
      newConfig.logos = newConfig.logos?.filter(Boolean) ?? [];
      const res = await serverActions.updateReportConfig({
        projectId: p.projectId,
        report_id: p.reportId,
        config: newConfig,
      });
      if (res.success === false) {
        return res;
      }
      await p.silentGetReportDetail(res.data.lastUpdated);
      // optimisticSetLastUpdated(p.reportId, res.data.lastUpdated);
      return res;
    },
    () => p.close(undefined),
  );

  async function attemptDeleteReport() {
    const deleteAction = timActionDelete(
      {
        text: t("Are you sure you want to delete this report?"),
        itemList: [p.reportConfig.label],
      },
      () =>
        serverActions.deleteReport({
          projectId: p.projectId,
          report_id: p.reportId,
        }),
      () => p.close("AFTER_DELETE_BACK_TO_PROJECT_WITH_PROJECT_UPDATE"),
    );

    await deleteAction.click();
  }

  const cDetail = () => getColorDetailsForColorTheme(tempConfig.colorTheme);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={t2(T.FRENCH_UI_STRINGS.report_settings)}>
          <div class="ui-gap-sm flex">
            <Button
              onClick={save.click}
              state={save.state()}
              intent="success"
              iconName="save"
              // disabled={!paramsNeedSaving()}
            >
              {t2(T.FRENCH_UI_STRINGS.save)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.cancel)}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy">
        <div class="ui-gap flex flex-wrap">
          <SettingsSection header={t2(T.FRENCH_UI_STRINGS.general)}>
            <div class="w-96">
              <Input
                label={t2(T.FRENCH_UI_STRINGS.report_name)}
                value={tempConfig.label}
                onChange={(v) => setTempConfig("label", v)}
                fullWidth
              />
            </div>
          </SettingsSection>
          <SettingsSection header={t2(T.FRENCH_UI_STRINGS.style)}>
            <div class="ui-gap flex">
              <div class="ui-spy-sm">
                <div class="w-96">
                  <Select
                    label={t2(T.FRENCH_UI_STRINGS.report_color_theme)}
                    value={tempConfig.colorTheme}
                    options={_COLOR_THEMES.map((theme) => {
                      const cDetails = getColorDetailsForColorTheme(theme);
                      return {
                        value: theme,
                        label: cDetails.label,
                      };
                    })}
                    onChange={(v) =>
                      setTempConfig("colorTheme", v as ColorTheme)
                    }
                    fullWidth
                  />
                </div>
                <div class="w-96">
                  <Select
                    label={t2(T.FRENCH_UI_STRINGS.background_detail)}
                    value={tempConfig.overlay}
                    options={[
                      { value: "none", label: "None" },
                      { value: "dots", label: "Dots" },
                      { value: "rivers", label: "Maze" },
                      { value: "waves", label: "Waves" },
                      { value: "world", label: "World" },
                    ]}
                    onChange={(v) =>
                      setTempConfig("overlay", v as "dots" | "none")
                    }
                    fullWidth
                  />
                </div>
              </div>
              <div
                class="relative aspect-video w-96 rounded"
                style={{
                  background: cDetail().primaryBackgroundColor,
                }}
              >
                <Show when={tempConfig.overlay !== "none"}>
                  <img
                    class="w-full rounded"
                    src={`/images/${tempConfig.overlay}_for_${cDetail().lightOrDark}_themes.png`}
                  />
                </Show>
                <div
                  class="font-700 absolute inset-0 flex items-center justify-center"
                  style={{
                    "letter-spacing": "-0.02em",
                    color: cDetail().primaryTextColor,
                  }}
                >
                  <div class="space-y-1 text-center">
                    <div class="font-700 text-2xl">Example title</div>
                    <div class="font-400 text-base">Sub-title</div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsSection>
          <SettingsSection header={t2(T.FRENCH_UI_STRINGS.logos)}>
            <StateHolderWrapper state={assetListing.state()} noPad>
              {(keyedAssets) => {
                return (
                  <div class="ui-spy-sm">
                    <For each={tempConfig.logos}>
                      {(logo, i_logo) => {
                        return (
                          <div class="ui-gap-sm flex items-center">
                            <Select
                              options={getSelectOptions(
                                keyedAssets
                                  .filter((f) => f.isImage)
                                  .map((f) => f.fileName),
                              )}
                              value={logo}
                              onChange={(v) =>
                                setTempConfig("logos", i_logo(), v)
                              }
                              fullWidth
                            />
                            <Button
                              intent="danger"
                              onClick={() => removeLogo(i_logo())}
                              outline
                              iconName="trash"
                            >
                              {t2(T.FRENCH_UI_STRINGS.delete)}
                            </Button>
                          </div>
                        );
                      }}
                    </For>
                    <Button onClick={addLogo} iconName="plus">
                      {t2(T.FRENCH_UI_STRINGS.add_logo)}
                    </Button>
                  </div>
                );
              }}
            </StateHolderWrapper>
          </SettingsSection>
          <SettingsSection header={t("Page details")}>
            <div class="max-w-96">
              <Checkbox
                label={`${t2(T.FRENCH_UI_STRINGS.show_page_numbers)}${p.reportType === "slide_deck" ? ` ${t2(T.FRENCH_UI_STRINGS.except_on_cover_and_section_sl)}` : ""}`}
                checked={tempConfig.showPageNumbers}
                onChange={(v) => setTempConfig("showPageNumbers", v)}
              />
            </div>
            <div class="ui-spy-sm w-96">
              <Checkbox
                label={t2(T.FRENCH_UI_STRINGS.add_watermark)}
                checked={tempConfig.useWatermark}
                onChange={(v) => setTempConfig("useWatermark", v)}
              />
              <Show when={tempConfig.useWatermark}>
                <Input
                  label={t2(T.FRENCH_UI_STRINGS.watermark_text)}
                  value={tempConfig.watermarkText ?? ""}
                  onChange={(v) => setTempConfig("watermarkText", v)}
                  fullWidth
                />
              </Show>
            </div>
          </SettingsSection>
        </div>
        <div class="">
          <Button
            onClick={attemptDeleteReport}
            intent="danger"
            outline
            iconName="trash"
          >
            {t2(T.FRENCH_UI_STRINGS.delete_report)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
