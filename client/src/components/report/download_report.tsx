import { t3, TC } from "lib";
import {
  Button,
  EditorComponentProps,
  ModalContainer,
  RadioGroup,
  StateHolderFormError,
  toPct0,
  toPct1,
} from "panther";
import { Show, createSignal } from "solid-js";
import { exportReportAsPdf } from "~/exports/export_report_as_pdf";
import { exportReportAsWord } from "~/exports/export_report_as_word";

export function DownloadReport(
  p: EditorComponentProps<
    {
      projectId: string;
      reportId: string;
    },
    undefined
  >,
) {
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal<string>("");
  const [exportFormat, setExportFormat] = createSignal<string>("pdf");

  function progress(pct: number) {
    setPct(pct);
  }

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const format = exportFormat();

    const res =
      format === "word"
        ? await exportReportAsWord(p.projectId, p.reportId, progress)
        : await exportReportAsPdf(p.projectId, p.reportId, progress);
    if (res.success === false) {
      setErr(res.err);
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  return (
    <ModalContainer
      title={t3({ en: "Download report", fr: "Télécharger le rapport", pt: "Transferir relatório" })}
      width="sm"
      leftButtons={
        pct() > 0
          ? undefined
          : // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={attemptExport}
                intent="success"
                iconName="download"
              >
                {t3(TC.download)}
              </Button>,
              <Button
                onClick={() => p.close(undefined)}
                intent="neutral"
                iconName="x"
              >
                {t3(TC.done)}
              </Button>,
            ]
      }
    >
      <div class="ui-spy-sm">
        <RadioGroup
          options={[
            { value: "pdf", label: t3({ en: "PDF", fr: "PDF", pt: "PDF" }) },
            { value: "word", label: t3({ en: "Word (.docx)", fr: "Word (.docx)", pt: "Word (.docx)" }) },
          ]}
          value={exportFormat()}
          onChange={setExportFormat}
        />
      </div>
      <Show when={pct() > 0}>
        <div class="ui-spy-sm">
          <div class="bg-base-300 h-8 w-full">
            <div
              class="bg-primary h-full"
              style={{ width: toPct1(pct()) }}
            ></div>
          </div>
          <div class="text-center">{toPct0(pct())}</div>
        </div>
      </Show>
      <Show when={pct() === 0 && err()}>
        <StateHolderFormError state={{ status: "error", err: err() }} />
      </Show>
    </ModalContainer>
  );
}
