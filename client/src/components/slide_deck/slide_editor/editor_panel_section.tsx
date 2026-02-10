import { SectionSlide, t3 } from "lib";
import { Slider, TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  tempSlide: SectionSlide;
  setTempSlide: SetStoreFunction<any>;
};

export function SlideEditorPanelSection(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <TextArea
          label={t3({ en: "Section Title", fr: "Titre de section" })}
          value={p.tempSlide.sectionTitle}
          onChange={(v: string) => p.setTempSlide("sectionTitle", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t3({ en: "Section title font size", fr: "Taille de police du titre de section" })}
          min={4}
          max={16}
          step={1}
          value={p.tempSlide.sectionTextRelFontSize ?? 8}
          onChange={(v) => p.setTempSlide("sectionTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label={t3({ en: "Section Subtitle", fr: "Sous-titre de section" })}
          value={p.tempSlide.sectionSubtitle ?? ""}
          onChange={(v: string) => p.setTempSlide("sectionSubtitle", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t3({ en: "Section subtitle font size", fr: "Taille de police du sous-titre de section" })}
          min={2}
          max={10}
          step={1}
          value={p.tempSlide.smallerSectionTextRelFontSize ?? 5}
          onChange={(v) => p.setTempSlide("smallerSectionTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
      </div>
    </div>
  );
}
