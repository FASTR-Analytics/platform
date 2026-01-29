import { t, t2, T } from "lib";
import {
  Button,
  EditorComponentProps,
  RadioGroup,
  StateHolderFormError,
  toPct0,
  toPct1,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { exportSlideDeckAsPdfVector } from "~/export_report/export_slide_deck_as_pdf_vector";
import { exportSlideDeckAsPptxWithImages } from "~/export_report/export_slide_deck_as_pptx_with_images";

export function DownloadSlideDeck(
  p: EditorComponentProps<
    {
      projectId: string;
      deckId: string;
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

  async function attemptExport() {
    setErr("");
    setPct(0.02);
    await new Promise((res) => setTimeout(res, 0));
    const format = exportFormat();

    const res =
      format === "vector"
        ? await exportSlideDeckAsPdfVector(
            p.projectId,
            p.deckId,
            progress,
          )
        : await exportSlideDeckAsPptxWithImages(
            p.projectId,
            p.deckId,
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
      <div class="font-700 text-xl">{t("Download slide deck")}</div>
      <div class="ui-spy-sm">
        <div class="">{t("PDF")}</div>
        <RadioGroup
          options={[{ value: "vector", label: "Native PDF (Recommended)" }]}
          value={exportFormat()}
          onChange={setExportFormat}
        />
      </div>
      <div class="ui-spy-sm">
        <div class="">{t("PPTX")}</div>
        <RadioGroup
          options={[
            { value: "pptx", label: "Native PPTX with raster figures" },
          ]}
          value={exportFormat()}
          onChange={setExportFormat}
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
              onClick={attemptExport}
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
