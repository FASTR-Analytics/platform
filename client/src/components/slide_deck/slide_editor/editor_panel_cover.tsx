import { CoverSlide } from "lib";
import { TextArea } from "panther";
import { SetStoreFunction } from "solid-js/store";

type Props = {
  tempSlide: CoverSlide;
  setTempSlide: SetStoreFunction<any>;
};

export function SlideEditorPanelCover(p: Props) {
  return (
    <div class="ui-pad ui-spy">
      <TextArea
        label="Title"
        value={p.tempSlide.title}
        onChange={(v: string) => p.setTempSlide("title", v)}
        fullWidth
        height="80px"
      />
      <TextArea
        label="Subtitle"
        value={p.tempSlide.subtitle ?? ""}
        onChange={(v: string) => p.setTempSlide("subtitle", v || undefined)}
        fullWidth
        height="60px"
      />
      <TextArea
        label="Presenter"
        value={p.tempSlide.presenter ?? ""}
        onChange={(v: string) => p.setTempSlide("presenter", v || undefined)}
        fullWidth
        height="80px"
      />
      <TextArea
        label="Date"
        value={p.tempSlide.date ?? ""}
        onChange={(v: string) => p.setTempSlide("date", v || undefined)}
        fullWidth
        height="60px"
      />
    </div>
  );
}
