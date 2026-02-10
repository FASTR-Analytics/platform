// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";

export type ModalContainerWidth = "sm" | "md" | "lg" | "xl" | "2xl";
export type ModalContainerScroll = "content" | "page";

type ModalContainerProps = {
  children: JSX.Element;
  width?: ModalContainerWidth;
  scroll?: ModalContainerScroll;
  title?: string;
  topPanel?: JSX.Element;
  leftButtons?: JSX.Element;
  rightButtons?: JSX.Element;
};

const WIDTH_CLASSES: Record<ModalContainerWidth, string> = {
  sm: "w-[min(400px,calc(100vw-6rem))]",
  md: "w-[min(560px,calc(100vw-6rem))]",
  lg: "w-[min(800px,calc(100vw-6rem))]",
  xl: "w-[min(1000px,calc(100vw-6rem))]",
  "2xl": "w-[min(1200px,calc(100vw-6rem))]",
};

export function ModalContainer(p: ModalContainerProps) {
  const widthClass = () => WIDTH_CLASSES[p.width ?? "md"];
  const scroll = () => p.scroll ?? "content";

  return (
    <div
      class={`flex flex-col ${widthClass()}`}
      classList={{ "max-h-[80vh]": scroll() === "content" }}
    >
      <Show when={p.title || p.topPanel}>
        <div class="border-base-300 border-b px-6 py-5 leading-none">
          <Show
            when={p.topPanel}
            fallback={<h2 class="font-700 text-lg leading-none">{p.title}</h2>}
          >
            {p.topPanel}
          </Show>
        </div>
      </Show>
      <div
        class="ui-spy px-6 py-5"
        classList={{
          "min-h-0 flex-1 overflow-y-auto": scroll() === "content",
        }}
      >
        {p.children}
      </div>
      <Show when={p.leftButtons || p.rightButtons}>
        <div class="border-base-300 ui-gap-sm flex items-center border-t px-6 py-5">
          <Show when={p.leftButtons}>
            <div class="ui-gap-sm flex items-center">
              {p.leftButtons}
            </div>
          </Show>
          <Show when={p.rightButtons}>
            <div class="ui-gap-sm flex flex-1 items-center justify-end">
              {p.rightButtons}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
