import { getTextRenderingOptions } from "lib";
import {
  EditablePageHolder,
  Loading,
  SizeMeasurer,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  type PageInputs,
} from "panther";
import { Show } from "solid-js";

type Props = {
  pageInputs: PageInputs | null;
  isLoading: boolean;
};

export function WhiteboardCanvas(p: Props) {
  return (
    <div class="h-full w-full bg-base-200">
      <Show when={p.isLoading}>
        <div class="h-full w-full flex items-center justify-center">
          <Loading msg="Loading..." />
        </div>
      </Show>
      <Show when={!p.isLoading && !p.pageInputs}>
        <div class="h-full w-full flex items-center justify-center text-neutral text-center">
          <div>
            <div class="text-lg font-medium mb-2">Whiteboard is empty</div>
            <div class="text-sm">Ask the AI to show something</div>
          </div>
        </div>
      </Show>
      <Show when={!p.isLoading && p.pageInputs}>
        <SizeMeasurer class="h-full w-full p-4">
          {(size) => {
            const containerAspect = size.width / size.height;
            const canvasH = Math.round(_GLOBAL_CANVAS_PIXEL_WIDTH / containerAspect);
            return (
              <EditablePageHolder
                pageInputs={p.pageInputs!}
                fixedCanvasH={canvasH}
                fitWithin={true}
                textRenderingOptions={getTextRenderingOptions()}
                simpleError
                scalePixelResolution={1}
              />
            );
          }}
        </SizeMeasurer>
      </Show>
    </div>
  );
}
