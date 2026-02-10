import { CoverSlide, t3 } from "lib";
import { LabelHolder, MultiSelect, Slider, TextArea } from "panther";
import { Show } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  tempSlide: CoverSlide;
  setTempSlide: SetStoreFunction<any>;
  deckLogos: string[];
};

export function SlideEditorPanelCover(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <LabelHolder label={t3({ en: "Logos to use", fr: "Logos à utiliser" })}>
        <Show
          when={p.deckLogos.length > 0}
          fallback={
            <div class="text-xs text-neutral">
              {t3({ en: "No logos set in report settings", fr: "Aucun logo défini dans les paramètres du rapport" })}
            </div>
          }
        >
          <MultiSelect
            values={p.tempSlide.logos ?? []}
            options={p.deckLogos.map((logo) => ({
              value: logo,
              label: logo,
            }))}
            onChange={(selectedLogos) => {
              p.setTempSlide("logos", selectedLogos);
            }}
          />
        </Show>
      </LabelHolder>
      <div class="ui-spy-sm">
        <TextArea
          label={t3({ en: "Title", fr: "Titre" })}
          value={p.tempSlide.title}
          onChange={(v: string) => p.setTempSlide("title", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t3({ en: "Title font size", fr: "Taille de police du titre" })}
          min={5}
          max={20}
          step={1}
          value={p.tempSlide.titleTextRelFontSize ?? 10}
          onChange={(v) => p.setTempSlide("titleTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label={t3({ en: "Subtitle", fr: "Sous-titre" })}
          value={p.tempSlide.subtitle ?? ""}
          onChange={(v: string) => p.setTempSlide("subtitle", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t3({ en: "Subtitle font size", fr: "Taille de police du sous-titre" })}
          min={3}
          max={12}
          step={1}
          value={p.tempSlide.subTitleTextRelFontSize ?? 6}
          onChange={(v) => p.setTempSlide("subTitleTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label={t3({ en: "Presenter", fr: "Présentateur" })}
          value={p.tempSlide.presenter ?? ""}
          onChange={(v: string) => p.setTempSlide("presenter", v || undefined)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t3({ en: "Presenter font size", fr: "Taille de police du présentateur" })}
          min={2}
          max={12}
          step={1}
          value={p.tempSlide.presenterTextRelFontSize ?? 4}
          onChange={(v) => p.setTempSlide("presenterTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label={t3({ en: "Date", fr: "Date" })}
          value={p.tempSlide.date ?? ""}
          onChange={(v: string) => p.setTempSlide("date", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t3({ en: "Date font size", fr: "Taille de police de la date" })}
          min={2}
          max={10}
          step={1}
          value={p.tempSlide.dateTextRelFontSize ?? 3}
          onChange={(v) => p.setTempSlide("dateTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
      </div>
    </div>
  );
}
