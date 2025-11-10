// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, mergeProps, Show, splitProps } from "solid-js";
import { ChevronDownIcon, ChevronRightIcon } from "../icons/icons.tsx";

export interface CollapsibleSectionProps {
  title: string | JSX.Element;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  rightContent?: JSX.Element;
  children: JSX.Element;
  class?: string;
  shadedHeader?: boolean;
}

export function CollapsibleSection(props: CollapsibleSectionProps) {
  const merged = mergeProps({ defaultOpen: false, class: "" }, props);
  const [local, others] = splitProps(merged, [
    "title",
    "isOpen",
    "defaultOpen",
    "onToggle",
    "rightContent",
    "children",
    "class",
  ]);

  // Use internal state if uncontrolled, otherwise use prop
  const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen);
  const isOpen = () => local.isOpen ?? internalOpen();

  const handleToggle = () => {
    if (local.isOpen === undefined) {
      // Uncontrolled mode
      setInternalOpen(!internalOpen());
      local.onToggle?.(!internalOpen());
    } else {
      // Controlled mode
      local.onToggle?.(!local.isOpen);
    }
  };

  return (
    <div class={`border-base-300 rounded border ${local.class}`} {...others}>
      <div
        class="ui-pad ui-hoverable data-[shaded=true]:bg-base-200 flex items-center"
        onClick={handleToggle}
        data-shaded={!!props.shadedHeader}
      >
        <div class="flex-1">{local.title}</div>
        <Show when={local.rightContent}>
          <div class="mr-2">{local.rightContent}</div>
        </Show>
        <div class="h-[1.25em] w-[1.25em]">
          <Show when={isOpen()} fallback={<ChevronRightIcon />}>
            <ChevronDownIcon />
          </Show>
        </div>
      </div>
      <Show when={isOpen()}>
        <div class="border-base-300 border-t">{local.children}</div>
      </Show>
    </div>
  );
}
