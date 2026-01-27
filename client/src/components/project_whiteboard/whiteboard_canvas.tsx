import type { ContentSlide } from "lib";
import { getTextRenderingOptions } from "lib";
import { PageHolder, Loading, type PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { createMemo, Show } from "solid-js";
import { convertSlideToPageInputs } from "../project_ai_slide_deck/utils/convert_slide_to_page_inputs";

type Props = {
  projectId: string;
  content: ContentSlide | null;
  isLoading: boolean;
};

export function WhiteboardCanvas(p: Props) {
  const pageInputs = createMemo(() => {
    if (!p.content) return null;
    const result = convertSlideToPageInputs(p.projectId, p.content);
    return result.success ? result.data : null;
  });

  const canvasH = Math.round((_GLOBAL_CANVAS_PIXEL_WIDTH * 9) / 16);

  return (
    <div class="h-full w-full flex flex-col items-center justify-center bg-base-200 p-8">
      <Show when={p.isLoading}>
        <Loading msg="Loading..." />
      </Show>
      <Show when={!p.isLoading && !p.content}>
        <div class="text-neutral text-center">
          <div class="text-lg font-medium mb-2">Whiteboard is empty</div>
          <div class="text-sm">Ask the AI to show something</div>
        </div>
      </Show>
      <Show when={!p.isLoading && p.content && pageInputs()}>
        <div class="w-full max-w-4xl rounded-lg border bg-white shadow-lg overflow-hidden">
          <PageHolder
            pageInputs={pageInputs()!}
            fixedCanvasH={canvasH}
            textRenderingOptions={getTextRenderingOptions()}
            simpleError
            scalePixelResolution={1}
          />
        </div>
      </Show>
    </div>
  );
}
