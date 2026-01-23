import { type ProjectDetail } from "lib";
import { Loading } from "panther";
import { For, Show } from "solid-js";
import { SlideCard } from "./slide_card";

type Props = {
  projectDetail: ProjectDetail;
  deckId: string;
  slideIds: string[];
  isLoading: boolean;
};

export function SlideList(p: Props) {
  return (
    <div class="h-full overflow-auto p-4">
      <Show when={p.isLoading}>
        <Loading msg="Loading slides..." />
      </Show>
      <Show when={!p.isLoading && p.slideIds.length === 0}>
        <div class="text-neutral w-full py-16 text-center">
          No slides yet. Ask the AI to create some slides.
        </div>
      </Show>
      <Show when={!p.isLoading && p.slideIds.length > 0}>
        <div class="flex flex-wrap justify-center gap-4">
          <For each={p.slideIds}>
            {(slideId, getIndex) => (
              <SlideCard
                projectId={p.projectDetail.id}
                deckId={p.deckId}
                slideId={slideId}
                index={getIndex()}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
