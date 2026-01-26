import { SectionSlide } from "lib";
import { TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  tempSlide: SectionSlide;
  setTempSlide: SetStoreFunction<any>;
};

export function SlideEditorPanelSection(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <TextArea
        label="Section Title"
        value={p.tempSlide.sectionTitle}
        onChange={(v: string) => p.setTempSlide("sectionTitle", v)}
        fullWidth
        height="80px"
      />
      <TextArea
        label="Section Subtitle"
        value={p.tempSlide.sectionSubtitle ?? ""}
        onChange={(v: string) => p.setTempSlide("sectionSubtitle", v || undefined)}
        fullWidth
        height="60px"
      />
    </div>
  );
}
