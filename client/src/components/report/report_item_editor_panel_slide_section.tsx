import { ReportDetail, ReportItemConfig, t2, T } from "lib";
import { Slider, TextArea, TimActionButton } from "panther";
import { SetStoreFunction } from "solid-js/store";
import { t } from "lib";

type Props = {
  projectId: string;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  reportDetail: ReportDetail;
};

export function ReportItemEditorSlideSection(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <TextArea
          label={t2(T.FRENCH_UI_STRINGS.main_section_text)}
          value={p.tempReportItemConfig.section.sectionText ?? ""}
          onChange={(v) =>
            p.setTempReportItemConfig("section", "sectionText", v)
          }
          fullWidth
          height="80px"
        />
        <Slider
          label={t("Main section text font size")}
          min={5}
          max={20}
          step={1}
          value={p.tempReportItemConfig.section.sectionTextRelFontSize ?? 8}
          onChange={(v) =>
            p.setTempReportItemConfig("section", "sectionTextRelFontSize", v)
          }
          fullWidth
          showValueInLabel
        />
        <TextArea
          label={t2(T.FRENCH_UI_STRINGS.secondary_section_text)}
          value={p.tempReportItemConfig.section.smallerSectionText ?? ""}
          onChange={(v) =>
            p.setTempReportItemConfig("section", "smallerSectionText", v)
          }
          fullWidth
          height="80px"
        />
        <Slider
          label={t("Secondary section text font size")}
          min={2}
          max={12}
          step={1}
          value={
            p.tempReportItemConfig.section.smallerSectionTextRelFontSize ?? 5
          }
          onChange={(v) =>
            p.setTempReportItemConfig(
              "section",
              "smallerSectionTextRelFontSize",
              v,
            )
          }
          fullWidth
          showValueInLabel
        />
      </div>
    </div>
  );
}
