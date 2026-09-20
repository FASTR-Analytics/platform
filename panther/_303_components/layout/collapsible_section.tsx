// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, Show } from "solid-js";
import { Icon } from "../icons/mod.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";

export type CollapsibleSectionProps = DataAttrs & {
  title: string | JSX.Element;
  // Controlled when isOpen is given; otherwise the section owns its state,
  // starting from defaultOpen.
  isOpen?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  children?: JSX.Element;
  class?: string;
  borderStyle?: "full" | "bottom" | "top" | "none";
  padding?: "sm" | "md";
  boldHeader?: boolean;
};

const BORDER_CLASSES: Record<
  NonNullable<CollapsibleSectionProps["borderStyle"]>,
  string
> = {
  full: "border rounded",
  bottom: "border-b",
  top: "border-t",
  none: "",
};

export function CollapsibleSection(p: CollapsibleSectionProps) {
  const [dataAttrs] = splitDataAttrs(p);
  const [internalOpen, setInternalOpen] = createSignal(p.defaultOpen ?? false);
  const isOpen = () => p.isOpen ?? internalOpen();

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isOpen();
    if (p.isOpen === undefined) {
      setInternalOpen(next);
    }
    p.onToggle?.(next);
  };

  return (
    <div
      {...dataAttrs}
      class={[
        "overflow-x-hidden",
        BORDER_CLASSES[p.borderStyle ?? "full"],
        p.class,
      ].filter(Boolean).join(" ")}
    >
      <div
        class="ui-hoverable-base-100 flex items-center"
        classList={{
          "ui-pad-sm": p.padding === "sm",
          "ui-pad": p.padding !== "sm",
          "font-700": !!p.boldHeader,
        }}
        onClick={handleToggle}
      >
        <div class="flex-1">{p.title}</div>
        <div class="h-[1.25em] w-[1.25em]">
          <Icon iconName={isOpen() ? "chevronDown" : "chevronRight"} />
        </div>
      </div>
      <Show when={isOpen() && p.children} keyed>
        <div class="border-t">{p.children}</div>
      </Show>
    </div>
  );
}
