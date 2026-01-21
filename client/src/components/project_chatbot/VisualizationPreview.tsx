import { Button } from "panther";
import { createSignal, Show } from "solid-js";
import { PresentationObjectMiniDisplay } from "~/components/PresentationObjectMiniDisplay";

type Props = {
  projectId: string;
  presentationObjectId: string;
};

export function VisualizationPreview(p: Props) {
  const [isExpanded, setIsExpanded] = createSignal(false);

  return (
    <>
      <div
        class="border-base-300 cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
        onClick={() => setIsExpanded(true)}
      >
        <PresentationObjectMiniDisplay
          projectId={p.projectId}
          presentationObjectId={p.presentationObjectId}
          shapeType={"force-aspect-video"}
          scalePixelResolution={0.2}
        />
      </div>

      <Show when={isExpanded()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsExpanded(false)}
        >
          <div
            class="bg-base-100 relative max-h-[90vh] max-w-[80%] overflow-hidden rounded-lg px-12 py-10 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <PresentationObjectMiniDisplay
              projectId={p.projectId}
              presentationObjectId={p.presentationObjectId}
              shapeType={"force-aspect-video"}
              scalePixelResolution={1}
            />
            <div class="absolute right-4 top-4">
              <Button onClick={() => setIsExpanded(false)}>Close</Button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
