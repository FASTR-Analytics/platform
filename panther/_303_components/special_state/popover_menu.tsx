// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, For, JSX, onCleanup, onMount, Show } from "solid-js";
import { Button } from "../form_inputs/button.tsx";
import type { IconName } from "../icons/mod.ts";
import { IconRenderer } from "../form_inputs/icon_renderer.tsx";
import type { Intent } from "../types.ts";

// =============================================================================
// Types
// =============================================================================

export type MenuItemClickable = {
  type?: "item";
  label: string;
  icon?: IconName;
  intent?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
};

export type MenuItemDivider = {
  type: "divider";
};

export type MenuItem = MenuItemClickable | MenuItemDivider;

export type PopoverPosition =
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "top"
  | "top-start"
  | "top-end"
  | "left"
  | "right";

export type ShowMenuOptions = {
  x: number;
  y: number;
  position?: PopoverPosition;
  items: MenuItem[];
};

export type MenuButtonOptions = {
  buttonProps?: {
    iconName?: IconName;
    intent?: Intent;
    outline?: boolean;
    children?: JSX.Element;
  };
  position?: PopoverPosition;
  items: MenuItem[];
};

type MenuState = {
  x: number;
  y: number;
  position: PopoverPosition;
  items: MenuItem[];
};

// =============================================================================
// Module-level state
// =============================================================================

const [menuState, setMenuState] = createSignal<MenuState | undefined>();
let popoverRef: HTMLDivElement | undefined;
let virtualAnchorRef: HTMLDivElement | undefined;

const POPOVER_GAP = 6;

export function showMenu(opts: ShowMenuOptions): void {
  // Hide first to force recalculation of anchor positioning fallbacks
  popoverRef?.hidePopover();

  const position = opts.position ?? "bottom-start";

  setMenuState({
    x: opts.x,
    y: opts.y,
    position,
    items: opts.items,
  });

  // Offset anchor away from popover position to create gap
  let offsetX = 0;
  let offsetY = 0;

  if (position.startsWith("bottom")) {
    offsetY = POPOVER_GAP;
  } else if (position.startsWith("top")) {
    offsetY = -POPOVER_GAP;
  } else if (position === "left") {
    offsetX = -POPOVER_GAP;
  } else if (position === "right") {
    offsetX = POPOVER_GAP;
  }

  // Position the virtual anchor at click coordinates with offset
  if (virtualAnchorRef) {
    virtualAnchorRef.style.left = `${opts.x + offsetX}px`;
    virtualAnchorRef.style.top = `${opts.y + offsetY}px`;
  }

  // Double rAF: first lets SolidJS update DOM, second lets browser process styles
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popoverRef?.showPopover();
    });
  });
}

export function hideMenu(): void {
  popoverRef?.hidePopover();
  setMenuState(undefined);
}

// For testing
export function _resetMenuState(): void {
  setMenuState(undefined);
}

// =============================================================================
// Provider component
// =============================================================================

export function PopoverMenuProvider() {
  function handleItemClick(item: MenuItemClickable) {
    hideMenu();
    item.onClick();
  }

  function handleClickOutside(e: MouseEvent) {
    if (!menuState()) return;
    if (popoverRef && !popoverRef.contains(e.target as Node)) {
      hideMenu();
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && menuState()) {
      hideMenu();
    }
  }

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      {/* Virtual anchor - positioned at click coordinates */}
      <div ref={virtualAnchorRef} class="ui-popover-anchor" />

      {/* Menu popover */}
      <div
        ref={popoverRef}
        popover="manual"
        class="ui-popover-menu"
        data-position={menuState()?.position ?? "bottom-start"}
      >
        <Show when={menuState()} keyed>
          {(state) => (
            <div class="bg-base-100 min-w-[160px] overflow-hidden rounded-md border shadow-lg">
              <For each={state.items}>
                {(item) => (
                  <Show
                    when={item.type !== "divider"}
                    fallback={<div class="bg-base-300 my-1 h-px" />}
                  >
                    <button
                      type="button"
                      class="ui-hoverable flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50"
                      classList={{
                        "text-danger":
                          (item as MenuItemClickable).intent === "danger",
                      }}
                      disabled={(item as MenuItemClickable).disabled}
                      onClick={() => handleItemClick(item as MenuItemClickable)}
                    >
                      <Show when={(item as MenuItemClickable).icon}>
                        {(icon) => (
                          <span class="w-4">
                            <IconRenderer iconName={icon()} />
                          </span>
                        )}
                      </Show>
                      <span>{(item as MenuItemClickable).label}</span>
                    </button>
                  </Show>
                )}
              </For>
            </div>
          )}
        </Show>
      </div>
    </>
  );
}

// =============================================================================
// Menu button factory
// =============================================================================

export function createMenuButton(opts: MenuButtonOptions) {
  return function MenuButton(props: { class?: string }): JSX.Element {
    let buttonRef: HTMLButtonElement | undefined;

    function handleClick() {
      if (!buttonRef) return;
      const rect = buttonRef.getBoundingClientRect();

      // Position based on the specified position
      let x = rect.left;
      let y = rect.bottom;

      if (opts.position === "top" || opts.position === "top-start") {
        y = rect.top;
      } else if (opts.position === "top-end") {
        x = rect.right;
        y = rect.top;
      } else if (opts.position === "bottom-end") {
        x = rect.right;
      } else if (opts.position === "left") {
        x = rect.left;
        y = rect.top;
      } else if (opts.position === "right") {
        x = rect.right;
        y = rect.top;
      }

      showMenu({
        x,
        y,
        position: opts.position ?? "bottom-start",
        items: opts.items,
      });
    }

    return (
      <Button
        ref={buttonRef}
        onClick={handleClick}
        {...opts.buttonProps}
        {...props}
      />
    );
  };
}

// =============================================================================
// Menu trigger wrapper
// =============================================================================

export type MenuTriggerWrapperProps = {
  items: MenuItem[] | (() => MenuItem[]);
  position?: PopoverPosition;
  children: JSX.Element;
};

export function MenuTriggerWrapper(
  props: MenuTriggerWrapperProps,
): JSX.Element {
  let wrapperRef: HTMLSpanElement | undefined;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (!wrapperRef) return;
    const rect = wrapperRef.getBoundingClientRect();
    const position = props.position ?? "bottom-start";

    let x = rect.left;
    let y = rect.bottom;

    if (position === "top" || position === "top-start") {
      y = rect.top;
    } else if (position === "top-end") {
      x = rect.right;
      y = rect.top;
    } else if (position === "bottom-end") {
      x = rect.right;
    } else if (position === "left") {
      x = rect.left;
      y = rect.top;
    } else if (position === "right") {
      x = rect.right;
      y = rect.top;
    }

    const items = typeof props.items === "function"
      ? props.items()
      : props.items;

    showMenu({
      x,
      y,
      position,
      items,
    });
  }

  return (
    <span
      ref={wrapperRef}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      {props.children}
    </span>
  );
}

export function createMenuTriggerWrapper(opts: {
  items: MenuItem[] | (() => MenuItem[]);
  position?: PopoverPosition;
}) {
  return function MenuTriggerWrapperInstance(
    props: { children: JSX.Element },
  ): JSX.Element {
    return (
      <MenuTriggerWrapper items={opts.items} position={opts.position}>
        {props.children}
      </MenuTriggerWrapper>
    );
  };
}
