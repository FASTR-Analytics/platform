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
  onHeaderClick?: () => void;
  rightContent?: JSX.Element;
  children?: JSX.Element;
  class?: string;
  shadedHeader?: boolean;
  borderStyle?: "full" | "bottom" | "top" | "none";
  rounded?: boolean;
  boldHeader?: boolean;
  activeHeader?: boolean;
  padding?: "sm" | "md";
  contentBorder?: boolean;
  hideChevron?: boolean;
  noClickToCollapse?: boolean;
}

export function CollapsibleSection(props: CollapsibleSectionProps) {
  const merged = mergeProps(
    {
      defaultOpen: false,
      class: "",
      borderStyle: "full" as const,
      rounded: true,
      boldHeader: false,
      padding: "md" as const,
      contentBorder: true,
    },
    props,
  );
  const [local, others] = splitProps(merged, [
    "title",
    "isOpen",
    "defaultOpen",
    "onToggle",
    "onHeaderClick",
    "rightContent",
    "children",
    "class",
    "shadedHeader",
    "borderStyle",
    "rounded",
    "boldHeader",
    "activeHeader",
    "padding",
    "contentBorder",
    "hideChevron",
    "noClickToCollapse",
  ]);

  const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen);
  const isOpen = () => local.isOpen ?? internalOpen();

  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    local.onHeaderClick?.();

    if (!local.noClickToCollapse) {
      if (local.isOpen === undefined) {
        setInternalOpen(!internalOpen());
        local.onToggle?.(!internalOpen());
      } else {
        local.onToggle?.(!local.isOpen);
      }
    }
  };

  const containerClasses = () => {
    const classes = ["border-base-300", "overflow-x-hidden"];

    if (local.borderStyle === "full") {
      classes.push("border");
    } else if (local.borderStyle === "bottom") {
      classes.push("border-b");
    } else if (local.borderStyle === "top") {
      classes.push("border-t");
    }

    if (local.rounded) {
      classes.push("rounded");
    }

    if (local.class) {
      classes.push(local.class);
    }

    return classes.join(" ");
  };

  const headerPadding = () => (local.padding === "sm" ? "ui-pad-sm" : "ui-pad");

  return (
    <div class={containerClasses()} {...others}>
      <div
        class={`${headerPadding()} ui-hoverable flex items-center`}
        classList={{
          "bg-base-200": !!local.shadedHeader,
          "font-700": local.boldHeader,
          "text-primary": local.activeHeader,
          "bg-primary/10": local.activeHeader,
        }}
        onClick={handleToggle}
      >
        <div class="flex-1">{local.title}</div>
        <Show when={local.rightContent} keyed>
          {(content) => <div class="mr-2">{content}</div>}
        </Show>
        <Show when={!local.hideChevron} keyed>
          <div class="h-[1.25em] w-[1.25em]">
            <Show when={isOpen()} fallback={<ChevronRightIcon />} keyed>
              <ChevronDownIcon />
            </Show>
          </div>
        </Show>
      </div>
      <Show when={isOpen() && local.children} keyed>
        <div
          classList={{
            "border-base-300": local.contentBorder,
            "border-t": local.contentBorder,
          }}
        >
          {local.children}
        </div>
      </Show>
    </div>
  );
}
