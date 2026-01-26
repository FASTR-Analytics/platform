import { trackStore } from "@solid-primitives/deep";
import { Slide, getTextRenderingOptions } from "lib";
import {
  AlertComponentProps,
  Button,
  EditablePageHolder,
  FrameRightResizable,
  FrameTop,
  getEditorWrapper,
  StateHolder,
  PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  HeadingBar,
} from "panther";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { createStore, unwrap, reconcile } from "solid-js/store";
import { convertSlideToPageInputs } from "../utils/convert_slide_to_page_inputs";
import { SlideEditorPanel } from "./editor_panel";
import { convertSlideType } from "./convert_slide_type";

type SlideEditorInnerProps = {
  projectId: string;
  deckId: string;
  slideId: string;
  slide: Slide;
};

type Props = AlertComponentProps<SlideEditorInnerProps, Slide | undefined>;

export function SlideEditor(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [needsSave, setNeedsSave] = createSignal(false);
  const [tempSlide, setTempSlide] = createStore<Slide>(structuredClone(p.slide));
  const [pageInputs, setPageInputs] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
    msg: "Rendering...",
  });
  const [selectedBlockId, setSelectedBlockId] = createSignal<string | undefined>();

  // Render slide preview
  function attemptGetPageInputs(slide: Slide) {
    const res = convertSlideToPageInputs(p.projectId, slide);
    if (res.success) {
      setPageInputs({ status: "ready", data: res.data });
    } else {
      setPageInputs({ status: "error", err: res.err });
    }
  }

  // Debounced re-render on changes (100ms)
  let renderTimeout: ReturnType<typeof setTimeout> | null = null;
  let firstRun = true;

  createEffect(() => {
    trackStore(tempSlide);
    if (firstRun) {
      firstRun = false;
      return;
    }

    setNeedsSave(true);

    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }

    renderTimeout = setTimeout(() => {
      attemptGetPageInputs(unwrap(tempSlide));
    }, 100);
  });

  onMount(() => {
    attemptGetPageInputs(unwrap(tempSlide));
  });

  onCleanup(() => {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
    }
  });

  function handleSave() {
    if (!needsSave()) {
      p.close(undefined);
      return;
    }
    p.close(unwrap(tempSlide));
  }

  function handleCancel() {
    p.close(undefined);
  }

  function handleTypeChange(newType: "cover" | "section" | "content") {
    const converted = convertSlideType(unwrap(tempSlide), newType);
    setTempSlide(reconcile(converted));
    setNeedsSave(true);
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading="Edit Slide"
            leftChildren={<Show
              when={needsSave()}
              fallback={
                <Button
                  iconName="chevronLeft"
                  onClick={handleCancel}
                />
              }
            >
              <div class="flex items-center ui-gap-sm">

                <Button
                  intent="success"
                  onClick={handleSave}
                >
                  Save
                </Button>
                <Button
                  outline
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            </Show>}
          >
          </HeadingBar>
        }
      >
        <FrameRightResizable
          startingWidth={400}
          minWidth={300}
          maxWidth={600}
          panelChildren={
            <SlideEditorPanel
              projectId={p.projectId}
              tempSlide={tempSlide}
              setTempSlide={setTempSlide}
              selectedBlockId={selectedBlockId()}
              setSelectedBlockId={setSelectedBlockId}
              openEditor={openEditor}
              onTypeChange={handleTypeChange}
            />
          }
        >
          <div class="h-full w-full overflow-auto ui-pad bg-base-200">
            <Show when={pageInputs().status === "loading"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-base-content/70">Rendering slide...</div>
              </div>
            </Show>
            <Show when={pageInputs().status === "error"}>
              <div class="flex h-full items-center justify-center">
                <div class="text-error">Error: {(pageInputs() as any).err}</div>
              </div>
            </Show>
            <Show when={pageInputs().status === "ready" ? (pageInputs() as { status: "ready"; data: PageInputs }).data : undefined} keyed>
              {(keyedPageInputs) => (
                <div class="h-full w-full overflow-auto ui-pad bg-base-200">
                  <EditablePageHolder
                    pageInputs={keyedPageInputs}
                    canvasElementId="SLIDE_EDITOR_CANVAS"
                    fixedCanvasH={Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16)}
                    fitWithin={true}
                    textRenderingOptions={getTextRenderingOptions()}
                    hoverStyle={{
                      fillColor: "rgba(0, 112, 243, 0.1)",
                      strokeColor: "rgba(0, 112, 243, 0.8)",
                      strokeWidth: 2,
                      showLayoutBoundaries: true,
                    }}
                    onClick={(target) => {
                      if (target.type === "layoutItem") {
                        setSelectedBlockId(target.node.id);
                      }
                    }}
                    onContextMenu={(e, target) => {
                      // Future: Layout manipulation menu
                    }}
                  />
                </div>
              )}
            </Show>
          </div>
        </FrameRightResizable>
      </FrameTop>
    </EditorWrapper>
  );
}
