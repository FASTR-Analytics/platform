import { ReportDetail, ReportItemConfig, ReportConfig, t2, T } from "lib";
import { Checkbox, LabelHolder, MultiSelect, TextArea, TimActionButton } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { t } from "lib";

type Props = {
  projectId: string;
  tempReportItemConfig: ReportItemConfig;
  setTempReportItemConfig: SetStoreFunction<ReportItemConfig>;
  reportDetail: ReportDetail;
};

export function ReportItemEditorPolicyHeaderFooter(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.use_policy_brief_header)}
          checked={!!p.tempReportItemConfig.freeform.useHeader}
          onChange={(v) =>
            p.setTempReportItemConfig("freeform", "useHeader", v)
          }
        />
        <Show when={p.tempReportItemConfig.freeform.useHeader}>
          <LabelHolder label={t2(T.FRENCH_UI_STRINGS.header_logos)}>
            {(p.reportDetail.config as ReportConfig).logos && (p.reportDetail.config as ReportConfig).logos.length > 0 ? (
              <MultiSelect
                values={p.tempReportItemConfig.freeform.headerLogos ?? []}
                options={(p.reportDetail.config as ReportConfig).logos.map((logo) => ({
                  value: logo,
                  label: logo,
                }))}
                onChange={(selectedLogos) => {
                  p.setTempReportItemConfig("freeform", "headerLogos", selectedLogos);
                }}
              />
            ) : (
              <div class="text-xs text-neutral">
                {t2(T.FRENCH_UI_STRINGS.no_logos_set_in_report_setting)}
              </div>
            )}
          </LabelHolder>
          <TextArea
            label={t2(T.FRENCH_UI_STRINGS.header_text)}
            value={p.tempReportItemConfig.freeform.headerText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "headerText", v)
            }
            fullWidth
            height="80px"
          />
          <TextArea
            label={t2(T.FRENCH_UI_STRINGS.subheader_text)}
            value={p.tempReportItemConfig.freeform.subHeaderText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "subHeaderText", v)
            }
            fullWidth
            height="80px"
          />
          <TextArea
            label={t2(T.FRENCH_UI_STRINGS.date_text)}
            value={p.tempReportItemConfig.freeform.dateText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "dateText", v)
            }
            fullWidth
            height="40px"
          />
        </Show>
      </div>
      <div class="ui-spy-sm">
        <Checkbox
          label={t2(T.FRENCH_UI_STRINGS.use_policy_brief_footer)}
          checked={!!p.tempReportItemConfig.freeform.useFooter}
          onChange={(v) =>
            p.setTempReportItemConfig("freeform", "useFooter", v)
          }
        />
        <Show when={p.tempReportItemConfig.freeform.useFooter}>
          <TextArea
            label={t2(T.FRENCH_UI_STRINGS.footer_text)}
            value={p.tempReportItemConfig.freeform.footerText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "footerText", v)
            }
            fullWidth
            height="80px"
          />
          <LabelHolder label={t2(T.FRENCH_UI_STRINGS.footer_logos)}>
            {(p.reportDetail.config as ReportConfig).logos && (p.reportDetail.config as ReportConfig).logos.length > 0 ? (
              <MultiSelect
                values={p.tempReportItemConfig.freeform.footerLogos ?? []}
                options={(p.reportDetail.config as ReportConfig).logos.map((logo) => ({
                  value: logo,
                  label: logo,
                }))}
                onChange={(selectedLogos) => {
                  p.setTempReportItemConfig("freeform", "footerLogos", selectedLogos);
                }}
              />
            ) : (
              <div class="text-xs text-neutral">
                {t2(T.FRENCH_UI_STRINGS.no_logos_set_in_report_setting)}
              </div>
            )}
          </LabelHolder>
        </Show>
      </div>
    </div>
  );
}
