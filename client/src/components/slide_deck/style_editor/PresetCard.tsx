import type { JSX } from "solid-js";

type PresetCardProps = {
  name: string;
  selected: boolean;
  onClick: () => void;
  children: JSX.Element;
};

export function PresetCard(p: PresetCardProps) {
  return (
    <button
      type="button"
      class="w-24 cursor-pointer rounded-lg border-2 p-2 text-left"
      classList={{
        "border-primary": p.selected,
        "border-base-300 hover:border-base-400": !p.selected,
      }}
      onClick={p.onClick}
    >
      <div class="bg-base-200 mb-1 aspect-video overflow-hidden rounded">
        {p.children}
      </div>
      <div class="text-center text-sm font-medium">{p.name}</div>
    </button>
  );
}
