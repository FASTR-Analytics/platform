import { ProjectDirtyStates, t, t2, T } from "lib";
import {
  Button,
  EditorComponentProps,
  ModalContainer,
  RadioGroup,
  StateHolderFormError,
  downloadJson,
  toPct0,
  toPct1,
} from "panther";
import { Show, createSignal } from "solid-js";
import { exportReportAsPdfVector } from "~/export_report/export_report_as_pdf_vector";
import { exportReportAsPptx } from "~/export_report/export_report_as_pptx";
import { serverActions } from "~/server_actions";

export function DownloadReport(
  p: EditorComponentProps<
    {
      projectId: string;
      reportId: string;
      unwrappedPDS: ProjectDirtyStates;
    },
    undefined
  >,
) {
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal<string>("");
  const [exportFormat, setExportFormat] = createSignal<string>("vector");

  function progress(pct: number) {
    setPct(pct);
  }

  async function attemptExportReportAsPdf() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const format = exportFormat();
    if (format === "json") {
      setPct(0.4);
      const res = await serverActions.backupReport({
        projectId: p.projectId,
        report_id: p.reportId,
      });
      if (res.success === false) {
        setErr(res.err);
        setPct(0);
        return;
      }
      setPct(0.8);
      const fileName = `report_${new Date().toDateString().replaceAll(" ", "_")}.json`;
      downloadJson(res.data, fileName, "keep-undefined");
      p.close(undefined);
      return;
    }
    const res =
      format === "vector"
        ? await exportReportAsPdfVector(
            p.projectId,
            p.reportId,
            p.unwrappedPDS,
            progress,
          )
        : await exportReportAsPptx(
            p.projectId,
            p.reportId,
            p.unwrappedPDS,
            progress,
          );
    if (res.success === false) {
      setErr(res.err);
      setPct(0);
      return;
    }
    p.close(undefined);
  }

  return (
    <ModalContainer
      title={t("Download report")}
      width="sm"
      leftButtons={
        pct() > 0
          ? undefined
          : // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={attemptExportReportAsPdf}
                intent="success"
                iconName="download"
              >
                {t2(T.FRENCH_UI_STRINGS.download)}
              </Button>,
              <Button
                onClick={() => p.close(undefined)}
                intent="neutral"
                iconName="x"
              >
                {t2(T.FRENCH_UI_STRINGS.done)}
              </Button>,
            ]
      }
    >
      <div class="ui-spy-sm">
        <div class="">{t("PDF")}</div>
        <RadioGroup
          options={[{ value: "vector", label: "PDF" }]}
          value={exportFormat()}
          onChange={setExportFormat}
        />
      </div>
      <div class="ui-spy-sm">
        <div class="">{t("PPTX")}</div>
        <RadioGroup
          options={[{ value: "pptx", label: "PPTX" }]}
          value={exportFormat()}
          onChange={setExportFormat}
        />
      </div>
      <div class="ui-spy-sm">
        <div class="">{t2(T.FRENCH_UI_STRINGS.backup)}</div>
        <RadioGroup
          options={[{ value: "json", label: t("JSON file") }]}
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
