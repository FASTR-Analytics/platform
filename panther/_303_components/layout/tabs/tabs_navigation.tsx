// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import { t3 } from "../../deps.ts";
import { IconRenderer } from "../../form_inputs/icon_renderer.tsx";
import { Tooltip } from "../../special_state/tooltip.tsx";
import { Button } from "../../form_inputs/mod.ts";
import { type DataAttrs, splitDataAttrs } from "../../data_attrs.ts";
import type { ListItem } from "../../list_selection/list_item_types.ts";
import { intentDotClass } from "../../_internal/intent_classes.ts";
import {
  horizontalTabClasses,
  TabLabel,
  tabLabelString,
} from "./_internal/tab_label.tsx";

type TabsNavigationProps<T extends string = string, M = never> = DataAttrs & {
  items: ListItem<T, M>[];
  value: T;
  onChange: (value: T) => void;
  tabLabelFormatter?: (item: ListItem<T, M>) => string;
  vertical?: boolean;
  // The three below are horizontal only. The strip is pure geometry: it
  // paints no surface of its own and never puts space below the rail.
  size?: "sm";
  // By default the strip carries ui-pad-x so it can be a FrameTop panel or
  // sit under a HeadingBar bare, with the first label at the content edge.
  // noPad is for a strip inside padded content (a ui-pad / ui-spy stack, a
  // modal body): the parent's padding is the inset and the stack's spacing is
  // the room above the label, so the tabs keep only their bottom padding.
  noPad?: boolean;
  // Stops the rail at the strip's pad-x instead of running it to the panel
  // edge. Nothing to do with noPad: the rail already ends there.
  insetRail?: boolean;

  // Collapsible functionality (vertical only)
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function TabsNavigation<T extends string = string, M = never>(
  p: TabsNavigationProps<T, M>,
) {
  const [dataAttrs] = splitDataAttrs(p);
  const isVertical = () => p.vertical === true;
  const isCollapsed = () => p.collapsed === true && isVertical();
  const isCollapsible = () => p.collapsible === true && isVertical();
  const isSmall = () => p.size === "sm";
  const hasPadX = () => p.noPad !== true;
  // A panel strip at full size is a compact header: its height is the
  // shared token and the tabs stretch to fill it instead of padding.
  const isPanelHeader = () => hasPadX() && !isSmall();

  const isActive = (id: T) => id === p.value;

  const handleToggleCollapse = () => {
    p.onCollapsedChange?.(!p.collapsed);
  };

  const getTabClasses = (id: T) => {
    if (!isVertical()) {
      // -mb-px overlaps the tab's bottom pixel onto the rail so the underline
      // sits on the line.
      const padClasses = isPanelHeader()
        ? ""
        : hasPadX()
        ? "ui-pad-y-sm"
        : isSmall()
        ? "ui-pad-b-sm"
        : "ui-pad-b";
      return `${
        horizontalTabClasses(isActive(id), p.size)
      } -mb-px ${padClasses}`;
    } else {
      const gapClass = isCollapsed() ? "" : "gap-[0.75em]";
      const justifyClass = isCollapsed() ? "justify-center" : "justify-between";
      const paddingClass = isCollapsed() ? "pr-4 pl-5 py-4" : "py-4 pr-4 pl-5";
      const baseClasses =
        `ui-focusable relative flex items-center ${gapClass} ${justifyClass} ${paddingClass} w-full font-700 text-sm leading-tight cursor-pointer select-none`;

      if (isActive(id)) {
        return `${baseClasses} shadow-[inset_4px_0_0_0_var(--color-primary)] text-primary bg-base-200`;
      }
      // ui-hoverable-base-100, not the old hover:bg-base-100 — that was an
      // invisible hover on the sidebar's own base-100 background.
      return `${baseClasses} ui-hoverable-base-100 text-base-content hover:text-primary`;
    }
  };

  const formatter = (item: ListItem<T, M>) =>
    (p.tabLabelFormatter ?? tabLabelString)(item);

  // Horizontal: the rail is the border-b of the strip (running through its
  // pad-x to the panel edge) or of the row (stopping at the pad-x); each
  // tab's -mb-px pulls its underline down onto that line either way.
  const railOnRow = () => hasPadX() && p.insetRail === true;

  const containerClasses = () =>
    !isVertical()
      ? `w-full ${railOnRow() ? "" : "border-b"} ${
        hasPadX() ? "ui-pad-x" : ""
      } ${
        isPanelHeader()
          ? "flex flex-col min-h-[var(--ui-heading-bar-compact-height)]"
          : ""
      }`
      : "bg-base-100 flex w-full flex-col h-full";

  const rowClasses = () =>
    !isVertical()
      ? `flex ${railOnRow() ? "border-b" : ""} ${
        isSmall() ? "ui-gap" : "ui-gap-lg"
      } ${isPanelHeader() ? "flex-1" : ""}`
      : "flex-1 overflow-y-auto";

  const renderTabContent = (item: ListItem<T, M>) => {
    const dot = item.dot;
    const icon = item.iconName;

    if (isCollapsed()) {
      return (
        <span class="relative flex h-[1.25em] w-[1.25em] flex-none items-center">
          <IconRenderer iconName={icon ?? "chevronRight"} />
          <Show when={dot}>
            <span
              class={`${intentDotClass(dot!)} absolute -right-2 -top-1`}
            />
          </Show>
        </span>
      );
    }

    return (
      <TabLabel item={item} text={formatter(item)} vertical={isVertical()} />
    );
  };

  return (
    <div {...dataAttrs} class={containerClasses()}>
      <div class={rowClasses()}>
        <For each={p.items}>
          {(item) => {
            return (
              <Show
                when={isCollapsed()}
                fallback={
                  <button
                    type="button"
                    class={getTabClasses(item.id)}
                    onClick={() => p.onChange(item.id)}
                    aria-current={isActive(item.id) ? "page" : undefined}
                    role="tab"
                  >
                    {renderTabContent(item)}
                  </button>
                }
              >
                <Tooltip content={tabLabelString(item)} position="right">
                  <button
                    type="button"
                    class={getTabClasses(item.id)}
                    onClick={() => p.onChange(item.id)}
                    aria-current={isActive(item.id) ? "page" : undefined}
                    role="tab"
                  >
                    {renderTabContent(item)}
                  </button>
                </Tooltip>
              </Show>
            );
          }}
        </For>
      </div>

      <Show when={isCollapsible()}>
        <div
          class="flex items-center py-4"
          classList={{
            "justify-center": isCollapsed(),
            "pl-4": !isCollapsed(),
          }}
        >
          <Button
            onClick={handleToggleCollapse}
            ariaLabel={isCollapsed()
              ? t3({
                en: "Expand navigation",
                fr: "Développer la navigation",
                pt: "Expandir a navegação",
              })
              : t3({
                en: "Collapse navigation",
                fr: "Réduire la navigation",
                pt: "Recolher a navegação",
              })}
            iconName={isCollapsed() ? "chevronRight" : "chevronLeft"}
            intent="base-100"
          />
        </div>
      </Show>
    </div>
  );
}
