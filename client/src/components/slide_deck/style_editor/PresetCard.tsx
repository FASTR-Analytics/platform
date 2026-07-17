import type { JSX } from"solid-js";

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
 class="flex w-24 cursor-pointer flex-col rounded border p-2 text-left"
 classList={{
"border-primary border-2": p.selected,
"": !p.selected,
      }}
 onClick={p.onClick}
    >
      <div class="relative mb-1 aspect-video overflow-hidden rounded border">
        {p.children}
      </div>
      <div class="text-center text-sm">{p.name}</div>
    </button>
  );
}
