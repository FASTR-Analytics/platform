import { CoverSlide, t, t2, T } from "lib";
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
      <LabelHolder label={t2(T.FRENCH_UI_STRINGS.logos_to_use)}>
        <Show
          when={p.deckLogos.length > 0}
          fallback={
            <div class="text-xs text-neutral">
              {t2(T.FRENCH_UI_STRINGS.no_logos_set_in_report_setting)}
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
          label="Title"
          value={p.tempSlide.title}
          onChange={(v: string) => p.setTempSlide("title", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t("Title font size")}
          min={5}
          max={20}
          step={1}
          value={p.tempSlide.titleTextRelFontSize ?? 10}
          onChange={(v) => p.setTempSlide("titleTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Subtitle"
          value={p.tempSlide.subtitle ?? ""}
          onChange={(v: string) => p.setTempSlide("subtitle", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t("Subtitle font size")}
          min={3}
          max={12}
          step={1}
          value={p.tempSlide.subTitleTextRelFontSize ?? 6}
          onChange={(v) => p.setTempSlide("subTitleTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Presenter"
          value={p.tempSlide.presenter ?? ""}
          onChange={(v: string) => p.setTempSlide("presenter", v || undefined)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t("Presenter font size")}
          min={2}
          max={12}
          step={1}
          value={p.tempSlide.presenterTextRelFontSize ?? 4}
          onChange={(v) => p.setTempSlide("presenterTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Date"
          value={p.tempSlide.date ?? ""}
          onChange={(v: string) => p.setTempSlide("date", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t("Date font size")}
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
