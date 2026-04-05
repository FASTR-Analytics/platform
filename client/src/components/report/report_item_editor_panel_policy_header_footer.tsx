import { ReportDetail, ReportItemConfig, ReportConfig } from "lib";
import { Checkbox, LabelHolder, MultiSelect, TextArea, TimActionButton } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

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
          label="Use policy brief header"
          checked={!!p.tempReportItemConfig.freeform.useHeader}
          onChange={(v) =>
            p.setTempReportItemConfig("freeform", "useHeader", v)
          }
        />
        <Show when={p.tempReportItemConfig.freeform.useHeader}>
          <LabelHolder label="Header logos">
            {(p.reportDetail.config).logos && (p.reportDetail.config).logos.length > 0 ? (
              <MultiSelect
                values={p.tempReportItemConfig.freeform.headerLogos ?? []}
                options={(p.reportDetail.config).logos.map((logo) => ({
                  value: logo,
                  label: logo,
                }))}
                onChange={(selectedLogos) => {
                  p.setTempReportItemConfig("freeform", "headerLogos", selectedLogos);
                }}
              />
            ) : (
              <div class="text-xs text-neutral">
                {"No logos set in report settings"}
              </div>
            )}
          </LabelHolder>
          <TextArea
            label="Header text"
            value={p.tempReportItemConfig.freeform.headerText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "headerText", v)
            }
            fullWidth
            height="80px"
          />
          <TextArea
            label="Sub-header text"
            value={p.tempReportItemConfig.freeform.subHeaderText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "subHeaderText", v)
            }
            fullWidth
            height="80px"
          />
          <TextArea
            label="Date text"
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
          label="Use policy brief footer"
          checked={!!p.tempReportItemConfig.freeform.useFooter}
          onChange={(v) =>
            p.setTempReportItemConfig("freeform", "useFooter", v)
          }
        />
        <Show when={p.tempReportItemConfig.freeform.useFooter}>
          <TextArea
            label="Footer text"
            value={p.tempReportItemConfig.freeform.footerText ?? ""}
            onChange={(v) =>
              p.setTempReportItemConfig("freeform", "footerText", v)
            }
            fullWidth
            height="80px"
          />
          <LabelHolder label="Footer logos">
            {(p.reportDetail.config).logos && (p.reportDetail.config).logos.length > 0 ? (
              <MultiSelect
                values={p.tempReportItemConfig.freeform.footerLogos ?? []}
                options={(p.reportDetail.config).logos.map((logo) => ({
                  value: logo,
                  label: logo,
                }))}
                onChange={(selectedLogos) => {
                  p.setTempReportItemConfig("freeform", "footerLogos", selectedLogos);
                }}
              />
            ) : (
              <div class="text-xs text-neutral">
                {"No logos set in report settings"}
              </div>
            )}
          </LabelHolder>
        </Show>
      </div>
    </div>
  );
}
