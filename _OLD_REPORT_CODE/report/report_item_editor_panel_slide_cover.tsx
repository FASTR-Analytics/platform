import { ReportDetail, ReportItemConfig } from "lib";
import { LabelHolder, MultiSelect, Slider, TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  projectId: string;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  reportDetail: ReportDetail;
};

export function ReportItemEditorSlideCover(p: Props) {
  const config = p.reportDetail.config;

  return (
    <div class="ui-pad ui-spy">
      <LabelHolder label="Logos to use">
        {config.logos && config.logos.length > 0 ? (
          <MultiSelect
            values={p.tempReportItemConfig.cover.logos ?? []}
            options={config.logos.map((logo: string) => ({
              value: logo,
              label: logo,
            }))}
            onChange={(selectedLogos) => {
              p.setTempReportItemConfig("cover", "logos", selectedLogos);
            }}
          />
        ) : (
          <div class="text-xs text-neutral">
            {"No logos set in report settings"}
          </div>
        )}
      </LabelHolder>
      <div class="ui-spy-sm">
        <TextArea
          label="Main title text"
          value={p.tempReportItemConfig.cover.titleText ?? ""}
          onChange={(v) => p.setTempReportItemConfig("cover", "titleText", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label="Main title text font size"
          min={5}
          max={20}
          step={1}
          value={p.tempReportItemConfig.cover.titleTextRelFontSize ?? 10}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "titleTextRelFontSize", v)
          }
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Sub-title text"
          value={p.tempReportItemConfig.cover.subTitleText ?? ""}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "subTitleText", v)
          }
          fullWidth
          height="60px"
        />
        <Slider
          label="Sub-title title text font size"
          min={3}
          max={12}
          step={1}
          value={p.tempReportItemConfig.cover.subTitleTextRelFontSize ?? 6}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "subTitleTextRelFontSize", v)
          }
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Presenters text"
          value={p.tempReportItemConfig.cover.presenterText ?? ""}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "presenterText", v)
          }
          fullWidth
          height="80px"
        />
        <Slider
          label="Presenters text font size"
          min={2}
          max={12}
          step={1}
          value={p.tempReportItemConfig.cover.presenterTextRelFontSize ?? 4}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "presenterTextRelFontSize", v)
          }
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Date text"
          value={p.tempReportItemConfig.cover.dateText ?? ""}
          onChange={(v) => p.setTempReportItemConfig("cover", "dateText", v)}
          fullWidth
          height="60px"
        />
        <Slider
          label="Date text font size"
          min={2}
          max={10}
          step={1}
          value={p.tempReportItemConfig.cover.dateTextRelFontSize ?? 3}
          onChange={(v) =>
            p.setTempReportItemConfig("cover", "dateTextRelFontSize", v)
          }
          fullWidth
          showValueInLabel
        />
      </div>
    </div>
  );
}
