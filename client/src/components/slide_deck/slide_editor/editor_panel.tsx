import type { Slide, CoverSlide, SectionSlide, ContentSlide } from "lib";
import { OpenEditorProps } from "panther";
import { Match, Setter, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { SlideEditorPanelCover } from "./editor_panel_cover";
import { SlideEditorPanelSection } from "./editor_panel_section";
import { SlideEditorPanelContent } from "./editor_panel_content";
import type { SlideSession } from "~/state/project/collab";

type Props = {
  projectId: string;
  tempSlide: Slide;
  setTempSlide: SetStoreFunction<Slide>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  session: SlideSession | null;
  collabReady: boolean;
  onSelectTextTarget: (targetId: string | undefined) => void;
  openEditor: <TProps, TReturn>(v: OpenEditorProps<TProps, TReturn>) => Promise<TReturn | undefined>;
  contentTab: "slide" | "block";
  setContentTab: Setter<"slide" | "block">;
  onShowLayoutMenu: (x: number, y: number) => void;
  onEditVisualization: () => void;
  onSelectVisualization: () => void;
  onCreateVisualization: () => void;
  showCoverLogosByDefault: boolean;
  showHeaderLogosByDefault: boolean;
  showFooterLogosByDefault: boolean;
  hasGlobalFooterText: boolean;
};

export function SlideEditorPanel(p: Props) {
  return (
    <div class="flex h-full flex-col overflow-auto border-r border-base-content">
      <Switch>
        <Match when={p.tempSlide.type === "cover"}>
          <SlideEditorPanelCover
            tempSlide={p.tempSlide as CoverSlide}
            setTempSlide={p.setTempSlide}
            showLogosByDefault={p.showCoverLogosByDefault}
            session={p.session}
            collabReady={p.collabReady}
            onSelectTextTarget={p.onSelectTextTarget}
          />
        </Match>
        <Match when={p.tempSlide.type === "section"}>
          <SlideEditorPanelSection
            tempSlide={p.tempSlide as SectionSlide}
            setTempSlide={p.setTempSlide}
            session={p.session}
            collabReady={p.collabReady}
            onSelectTextTarget={p.onSelectTextTarget}
          />
        </Match>
        <Match when={p.tempSlide.type === "content"}>
          <SlideEditorPanelContent
            projectId={p.projectId}
            tempSlide={p.tempSlide as ContentSlide}
            setTempSlide={p.setTempSlide}
            selectedBlockId={p.selectedBlockId}
            setSelectedBlockId={p.setSelectedBlockId}
            session={p.session}
            collabReady={p.collabReady}
            onSelectTextTarget={p.onSelectTextTarget}
            openEditor={p.openEditor}
            contentTab={p.contentTab}
            setContentTab={p.setContentTab}
            onShowLayoutMenu={p.onShowLayoutMenu}
            onEditVisualization={p.onEditVisualization}
            onSelectVisualization={p.onSelectVisualization}
            onCreateVisualization={p.onCreateVisualization}
            showHeaderLogosByDefault={p.showHeaderLogosByDefault}
            showFooterLogosByDefault={p.showFooterLogosByDefault}
            hasGlobalFooterText={p.hasGlobalFooterText}
          />
        </Match>
      </Switch>
    </div>
  );
}
