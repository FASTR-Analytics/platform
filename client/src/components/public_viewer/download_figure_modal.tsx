import { Button, EditorComponentProps, ModalContainer, RadioGroup } from "panther";
import { createSignal } from "solid-js";
import { t3, TC } from "lib";

// `format` is fixed to "image" for now; the modal is shaped to grow other
// formats (CSV, JSON definition, …) without changing the call sites.
export type DownloadFigureFormat = "image";

export type DownloadFigureResult = {
  format: DownloadFigureFormat;
  transparent: boolean;
  padding: boolean;
};

export function DownloadFigureModal(
  p: EditorComponentProps<Record<string, never>, DownloadFigureResult>,
) {
  const [background, setBackground] = createSignal<string>("white");
  const [margin, setMargin] = createSignal<string>("padding");

  function done() {
    p.close({
      format: "image",
      transparent: background() === "transparent",
      padding: margin() === "padding",
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
      <div class="ui-gap flex">
        <RadioGroup
          label={t3({ en: "Background", fr: "Arrière-plan" })}
          options={[
            { value: "white", label: t3({ en: "White", fr: "Blanc" }) },
            {
              value: "transparent",
              label: t3({ en: "Transparent", fr: "Transparent" }),
            },
          ]}
          value={background()}
          onChange={setBackground}
        />
        <RadioGroup
          label={t3({ en: "Margin", fr: "Marge" })}
          options={[
            {
              value: "padding",
              label: t3({ en: "With margins", fr: "Avec marges" }),
            },
            {
              value: "no-padding",
              label: t3({ en: "No margins", fr: "Sans marges" }),
            },
          ]}
          value={margin()}
          onChange={setMargin}
        />
      </div>
    </ModalContainer>
  );
}
