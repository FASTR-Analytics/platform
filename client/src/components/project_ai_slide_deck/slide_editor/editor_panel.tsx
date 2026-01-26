import { Slide, CoverSlide, SectionSlide, ContentSlide } from "lib";
import { OpenEditorProps, Select } from "panther";
import { Match, Setter, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { SlideEditorPanelCover } from "./editor_panel_cover";
import { SlideEditorPanelSection } from "./editor_panel_section";
import { SlideEditorPanelContent } from "./editor_panel_content";

type Props = {
  projectId: string;
  tempSlide: Slide;
  setTempSlide: SetStoreFunction<Slide>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
  onTypeChange: (newType: "cover" | "section" | "content") => void;
};

export function SlideEditorPanel(p: Props) {
  return (
    <div class="flex h-full flex-col overflow-auto">
      {/* Type selector */}
      <div class="ui-pad border-b border-base-300">
        <Select
          label="Slide Type"
          options={[
            { value: "cover", label: "Cover" },
            { value: "section", label: "Section" },
            { value: "content", label: "Content" },
          ]}
          value={p.tempSlide.type}
          onChange={(v: string) => p.onTypeChange(v as "cover" | "section" | "content")}
          fullWidth
        />
      </div>

      {/* Type-specific editors */}
      <div class="flex-1 overflow-auto">
        <Switch>
          <Match when={p.tempSlide.type === "cover"}>
            <SlideEditorPanelCover
              tempSlide={p.tempSlide as CoverSlide}
              setTempSlide={p.setTempSlide}
            />
          </Match>
          <Match when={p.tempSlide.type === "section"}>
            <SlideEditorPanelSection
              tempSlide={p.tempSlide as SectionSlide}
              setTempSlide={p.setTempSlide}
            />
          </Match>
          <Match when={p.tempSlide.type === "content"}>
            <SlideEditorPanelContent
              projectId={p.projectId}
              tempSlide={p.tempSlide as ContentSlide}
              setTempSlide={p.setTempSlide}
              selectedBlockId={p.selectedBlockId}
              setSelectedBlockId={p.setSelectedBlockId}
              openEditor={p.openEditor}
            />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
