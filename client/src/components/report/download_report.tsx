import { ProjectDirtyStates, t, t2, T } from "lib";
import {
  Button,
  EditorComponentProps,
  RadioGroup,
  StateHolderFormError,
  downloadJson,
  toPct0,
  toPct1,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { exportReportAsPdfVector } from "~/export_report/export_report_as_pdf_vector";
import { exportReportAsPptxWithImages } from "~/export_report/export_report_as_pptx_with_images";
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
  const [resolution, setResolution] = createSignal<string>("vector");

  function progress(pct: number) {
    setPct(pct);
  }

  async function attemptExportReportAsPdf() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const finalResolution = resolution();
    if (finalResolution === "json") {
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
      finalResolution === "vector"
        ? await exportReportAsPdfVector(
            p.projectId,
            p.reportId,
            p.unwrappedPDS,
            progress,
          )
        : await exportReportAsPptxWithImages(
            p.projectId,
            p.reportId,
            Number(finalResolution),
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
    <div class="ui-spy w-[400px] px-8 py-6">
      <div class="font-700 text-xl">{t("Download report")}</div>
      <div class="ui-spy-sm">
        <div class="">{t("PDF")}</div>
        <RadioGroup
          options={[{ value: "vector", label: "Native PDF (Recommended!)" }]}
          value={resolution()}
          onChange={setResolution}
        />
      </div>
      <div class="ui-spy-sm">
        <div class="">{t("Image-based PPTX")}</div>
        <RadioGroup
          options={[
            { value: "0.2", label: "Image-based PPTX: Very low quality" },
            { value: "0.33", label: t("Image-based PPTX: Low quality") },
            { value: "0.6", label: "Image-based PPTX: Medium quality" },
            { value: "1", label: t("Image-based PPTX: High quality") },
            // // { value: "0.2", label: "Image-based PDF: Very low quality" },
            // { value: "0.33", label: t("Image-based PDF: Low quality") },
            // // { value: "0.6", label: "Image-based PDF: Medium quality" },
            // { value: "1", label: t("Image-based PDF: High quality") },
          ]}
          value={resolution()}
          onChange={setResolution}
        />
      </div>
      <div class="ui-spy-sm">
        <div class="">{t2(T.FRENCH_UI_STRINGS.backup)}</div>
        <RadioGroup
          options={[{ value: "json", label: t("JSON file") }]}
          value={resolution()}
          onChange={setResolution}
        />
      </div>
      <Switch>
        <Match when={pct() > 0}>
          <div class="ui-spy-sm">
            <div class="bg-base-300 h-8 w-full">
              <div
                class="bg-primary h-full"
                style={{ width: toPct1(pct()) }}
              ></div>
            </div>
            <div class="text-center">{toPct0(pct())}</div>
          </div>
        </Match>
        <Match when={true}>
          <Show when={err()}>
            <StateHolderFormError state={{ status: "error", err: err() }} />
          </Show>
          <div class="ui-gap-sm flex">
            <Button
              onClick={attemptExportReportAsPdf}
              intent="success"
              iconName="download"
            >
              {t2(T.FRENCH_UI_STRINGS.download)}
            </Button>
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.done)}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
