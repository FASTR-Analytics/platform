import { SectionSlide, t } from "lib";
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
          label="Section Title"
          value={p.tempSlide.sectionTitle}
          onChange={(v: string) => p.setTempSlide("sectionTitle", v)}
          fullWidth
          height="80px"
        />
        <Slider
          label={t("Section title font size")}
          min={4}
          max={16}
          step={1}
          value={p.tempSlide.sectionTextRelFontSize ?? 8}
          onChange={(v) => p.setTempSlide("sectionTextRelFontSize", v)}
          fullWidth
          showValueInLabel
        />
        <TextArea
          label="Section Subtitle"
          value={p.tempSlide.sectionSubtitle ?? ""}
          onChange={(v: string) => p.setTempSlide("sectionSubtitle", v || undefined)}
          fullWidth
          height="60px"
        />
        <Slider
          label={t("Section subtitle font size")}
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
