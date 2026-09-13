// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";

export type ModalContainerWidth =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl";
export type ModalContainerHeight = "sm" | "md" | "lg" | "xl";
export type ModalContainerScroll = "content" | "page";

type ModalContainerProps =
  & {
    children: JSX.Element;
    width?: ModalContainerWidth;
    title?: string;
    topPanel?: JSX.Element;
    leftButtons?: JSX.Element;
    rightButtons?: JSX.Element;
    noContentPadding?: boolean;
  }
  & (
    | { scroll?: "content"; height?: ModalContainerHeight }
    // A fixed height needs the content region to scroll; under page scroll
    // tall content would overflow the container.
    | { scroll: "page"; height?: never }
  );

const WIDTH_CLASSES: Record<ModalContainerWidth, string> = {
  sm: "w-[min(400px,var(--ui-modal-max-w))]",
  md: "w-[min(560px,var(--ui-modal-max-w))]",
  lg: "w-[min(800px,var(--ui-modal-max-w))]",
  xl: "w-[min(1000px,var(--ui-modal-max-w))]",
  "2xl": "w-[min(1200px,var(--ui-modal-max-w))]",
  "3xl": "w-[min(1400px,var(--ui-modal-max-w))]",
  "4xl": "w-[min(1600px,var(--ui-modal-max-w))]",
};

const HEIGHT_CLASSES: Record<ModalContainerHeight, string> = {
  sm: "h-[min(480px,var(--ui-modal-max-h))]",
  md: "h-[min(640px,var(--ui-modal-max-h))]",
  lg: "h-[min(800px,var(--ui-modal-max-h))]",
  xl: "h-(--ui-modal-max-h)",
};

export function ModalContainer(p: ModalContainerProps) {
  const widthClass = () => WIDTH_CLASSES[p.width ?? "md"];
  const heightClass = () => p.height ? HEIGHT_CLASSES[p.height] : "";
  const scroll = () => p.scroll ?? "content";
  return (
    <div
      class={`flex flex-col ${widthClass()} ${heightClass()}`}
      classList={{ "max-h-(--ui-modal-max-h)": scroll() === "content" }}
    >
      <Show when={p.title || p.topPanel}>
        {
          /* The header row's height floor is a form control's height, as in
            HeadingBar: a title-only header is as tall as one holding
            buttons or a stepper, so a modal that swaps between the two
            (loading vs loaded) does not jump. It also matches the footer. */
        }
        <div class="border-b px-6 py-5 leading-none">
          <div class="grid min-h-(--ui-form-height) items-center">
            <Show
              when={p.topPanel}
              fallback={<h2 class="ui-text-heading leading-none">{p.title}</h2>}
            >
              {p.topPanel}
            </Show>
          </div>
        </div>
      </Show>
      <div
        class="ui-spy"
        classList={{
          "px-6 py-5": !p.noContentPadding,
          "min-h-0 flex-1 overflow-y-auto": scroll() === "content",
        }}
      >
        {p.children}
      </div>
      <Show when={p.leftButtons || p.rightButtons}>
        <div class="ui-gap-sm flex items-center border-t px-6 py-5">
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
