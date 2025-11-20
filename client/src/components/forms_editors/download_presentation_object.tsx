import { Button, EditorComponentProps, RadioGroup } from "panther";
import { Show, createSignal } from "solid-js";
import { t, t2, T, PresentationObjectDetail } from "lib";

export function DownloadPresentationObject(
  p: EditorComponentProps<
    {
      isReplicateBy: boolean;
      poDetail: PresentationObjectDetail;
    },
    {
      transparent: boolean;
      padding: boolean;
      allReplicants: boolean;
      format: "image" | "data-visualization" | "data-results-file" | "json-definition";
    }
  >,
) {
  const [format, setFormat] = createSignal<
    "image" | "data-visualization" | "data-results-file" | "json-definition"
  >("image");
  const [transparent, setTransparent] = createSignal<string>("white");
  const [padding, setPadding] = createSignal<string>("padding");
  // const [allReplicants, setAllReplicants] = createSignal<string>("all");

  function done() {
    return p.close({
      transparent: transparent() === "transparent",
      padding: padding() === "padding",
      // allReplicants: p.isReplicateBy && allReplicants() === "all",
      allReplicants: false,
      format: format(),
    });
  }

  return (
    <div class="ui-spy px-8 py-6">
      <div class="text-xl font-700">{t2(T.FRENCH_UI_STRINGS.download)}</div>
      <div class="">
        <RadioGroup
          label={t2(T.FRENCH_UI_STRINGS.format)}
          options={[
            { value: "image", label: t2(T.FRENCH_UI_STRINGS.visualization_1) },
            {
              value: "data-visualization",
              label: t2(T.FRENCH_UI_STRINGS.aggregated_data_for_the_visual),
            },
            { value: "data-results-file", label: t2(T.FRENCH_UI_STRINGS.results_file_data) },
            { value: "json-definition", label: "JSON definition" },
          ]}
          value={format()}
          onChange={setFormat}
        />
      </div>
      <Show when={format() === "image"}>
        <div class="flex ui-gap">
          <RadioGroup
            label={t2(T.FRENCH_UI_STRINGS.background)}
            options={[
              { value: "white", label: t2(T.FRENCH_UI_STRINGS.white) },
              { value: "transparent", label: t2(T.FRENCH_UI_STRINGS.transparent) },
            ]}
            value={transparent()}
            onChange={setTransparent}
          />
          <RadioGroup
            label={t2(T.FRENCH_UI_STRINGS.margin)}
            options={[
              { value: "padding", label: t2(T.FRENCH_UI_STRINGS.with_margins) },
              { value: "no-padding", label: t2(T.FRENCH_UI_STRINGS.no_margins) },
            ]}
            value={padding()}
            onChange={setPadding}
          />
        </div>
      </Show>
      <div class="ui-gap-sm flex">
        <Button onClick={done} intent="success" iconName="download">
          {t2(T.FRENCH_UI_STRINGS.download)}
        </Button>
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t2(T.FRENCH_UI_STRINGS.cancel)}
        </Button>
      </div>
    </div>
  );
}
