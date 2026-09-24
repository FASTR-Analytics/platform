import type { JSX } from "solid-js";
import { Show } from "solid-js";

type PresetCardProps = {
  name: string;
  caption?: string;
  selected: boolean;
  onClick: () => void;
  children: JSX.Element;
};

// w-52 rather than the w-24 this card used when it held a layout or treatment
// thumbnail: it now previews a whole content slide, and the colour picker
// modal that was deleted alongside those pickers had already established that
// anything narrower is unreadable at slide aspect.
export function PresetCard(p: PresetCardProps) {
  return (
    <button
      type="button"
      class="flex w-52 cursor-pointer flex-col rounded border p-2 text-left"
      classList={{
        "border-primary border-2": p.selected,
      }}
      onClick={p.onClick}
    >
      <div class="relative mb-1 aspect-video overflow-hidden rounded border">
        {p.children}
      </div>
      <div class="text-center text-sm">{p.name}</div>
      <Show when={p.caption}>
        <div class="ui-text-caption mt-0.5 text-center">{p.caption}</div>
      </Show>
    </button>
  );
}
