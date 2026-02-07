import { Button } from "panther";
import { Show } from "solid-js";
import { useAIProjectContext } from "./context";

export function DraftPreview() {
  const { draftContent, setDraftContent } = useAIProjectContext();

  const content = () => draftContent();

  const handleAddToDeck = () => {
    // TODO: Open deck selector modal, then add slide
    console.log("Add to deck", content());
  };

  const handleSaveAsViz = () => {
    // TODO: Open save viz modal
    console.log("Save as viz", content());
  };

  const handleDismiss = () => {
    setDraftContent(null);
  };

  return (
    <Show when={content()}>
      {(c) => (
        <div class="border-b bg-base-100 p-3">
          <div class="mb-2 text-xs font-600 text-base-content/60">
            {c().type === "slide" ? "Draft Slide" : "Draft Visualization"}
          </div>

          {/* TODO: Render preview using whiteboard canvas rendering */}
          <div class="mb-3 rounded border bg-base-200 p-4 text-sm">
            <div class="font-600">{c().input.header || "Content"}</div>
            <div class="text-xs text-base-content/60">
              {c().input.blocks.length} block(s)
            </div>
          </div>

          <div class="flex gap-2">
            <Show when={c().type === "slide"}>
              <Button size="sm" onClick={handleAddToDeck}>
                Add to deck
              </Button>
            </Show>
            <Show when={c().type === "viz"}>
              <Button size="sm" onClick={handleSaveAsViz}>
                Save as viz
              </Button>
            </Show>
            <Button size="sm" outline onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </Show>
  );
}
