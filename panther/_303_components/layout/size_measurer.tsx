// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, onMount, onCleanup, type JSX, Show } from "solid-js";

type Size = { width: number; height: number };

type Props = {
  children: (size: Size) => JSX.Element;
  class?: string;
};

export function SizeMeasurer(p: Props) {
  let container!: HTMLDivElement;
  const [size, setSize] = createSignal<Size | null>(null);

  onMount(() => {
    const rect = container.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div ref={container!} class={p.class ?? "h-full w-full"}>
      <Show when={size()} keyed>
        {(s) => p.children(s)}
      </Show>
    </div>
  );
}
