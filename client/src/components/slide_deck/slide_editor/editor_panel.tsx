import type {
  Slide,
  CoverSlide,
  SectionSlide,
  ContentSlide,
  FigureBundle,
  PackageScope,
  RunAuthoringContext,
} from "lib";
import { OpenEditorProps } from "panther";
import { Match, Setter, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { SlideEditorPanelCover } from "./editor_panel_cover";
import { SlideEditorPanelSection } from "./editor_panel_section";
import { SlideEditorPanelContent } from "./editor_panel_content";
import type { SlideSession } from "~/state/instance/collab";

type Props = {
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
  /** Set ⇔ the SELECTED block is a figure resolved under a different pair. */
  staleFigureBundle: FigureBundle | undefined;
  /** Why the last update attempt on the selected figure failed (D4: the reason
   *  is shown on the figure, never as a modal that loses which one it was). */
  figureUpdateError: string | undefined;
  onUpdateFigure: () => Promise<void>;
  tempSlide: Slide;
  setTempSlide: SetStoreFunction<Slide>;
  selectedBlockId: string | undefined;
  setSelectedBlockId: Setter<string | undefined>;
  session: SlideSession | null;
  collabReady: boolean;
  onSelectTextTarget: (targetId: string | undefined) => void;
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
  contentTab: "slide" | "block";
  setContentTab: Setter<"slide" | "block">;
  onShowLayoutMenu: (x: number, y: number) => void;
  onEditVisualization: () => void;
  onInsertFigure: () => void;
  showCoverLogosByDefault: boolean;
  showHeaderLogosByDefault: boolean;
  showFooterLogosByDefault: boolean;
  hasGlobalFooterText: boolean;
};

export function SlideEditorPanel(p: Props) {
  return (
    <div class="flex h-full flex-col overflow-auto">
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
            scope={p.scope}
            authoringContext={p.authoringContext}
            staleFigureBundle={p.staleFigureBundle}
            figureUpdateError={p.figureUpdateError}
            onUpdateFigure={p.onUpdateFigure}
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
            onInsertFigure={p.onInsertFigure}
            showHeaderLogosByDefault={p.showHeaderLogosByDefault}
            showFooterLogosByDefault={p.showFooterLogosByDefault}
            hasGlobalFooterText={p.hasGlobalFooterText}
          />
        </Match>
      </Switch>
    </div>
  );
}
