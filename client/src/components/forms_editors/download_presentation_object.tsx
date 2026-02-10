import { Button, EditorComponentProps, ModalContainer, RadioGroup } from "panther";
import { Show, createSignal } from "solid-js";
import { t3, TC, PresentationObjectDetail } from "lib";

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
    <ModalContainer
      title={t3(TC.download)}
      width="sm"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={done} intent="success" iconName="download">
            {t3(TC.download)}
          </Button>,
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <div class="">
        <RadioGroup
          label={t3({ en: "Format", fr: "Format" })}
          options={[
            { value: "image", label: t3({ en: "Visualization", fr: "Visualisation" }) },
            {
              value: "data-visualization",
              label: t3({ en: "Aggregated data for the visualization", fr: "Données agrégées pour la visualisation" }),
            },
            { value: "data-results-file", label: t3({ en: "Results file data", fr: "Données du fichier de résultats" }) },
            { value: "json-definition", label: t3({ en: "JSON definition", fr: "Définition JSON" }) },
          ]}
          value={format()}
          onChange={setFormat}
        />
      </div>
      <Show when={format() === "image"}>
        <div class="flex ui-gap">
          <RadioGroup
            label={t3({ en: "Background", fr: "Arrière-plan" })}
            options={[
              { value: "white", label: t3({ en: "White", fr: "Blanc" }) },
              { value: "transparent", label: t3({ en: "Transparent", fr: "Transparent" }) },
            ]}
            value={transparent()}
            onChange={setTransparent}
          />
          <RadioGroup
            label={t3({ en: "Margin", fr: "Marge" })}
            options={[
              { value: "padding", label: t3({ en: "With margins", fr: "Avec marges" }) },
              { value: "no-padding", label: t3({ en: "No margins", fr: "Sans marges" }) },
            ]}
            value={padding()}
            onChange={setPadding}
          />
        </div>
      </Show>
    </ModalContainer>
  );
}
