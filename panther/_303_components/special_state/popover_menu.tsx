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
  subMenu?: never;
};

export type MenuItemWithSubmenu = {
  type?: "sub-item";
  label: string;
  icon?: IconName;
  disabled?: boolean;
  subMenu: MenuItem[];
  onClick?: never;
};

export type MenuItemDivider = {
  type: "divider";
};

export type MenuItem =
  | MenuItemClickable
  | MenuItemWithSubmenu
  | MenuItemDivider;

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

type SubMenuState = {
  parentItemIndex: number;
  items: MenuItem[];
};

// =============================================================================
// Module-level state
// =============================================================================

const [menuState, setMenuState] = createSignal<MenuState | undefined>();
const [subMenuState, setSubMenuState] = createSignal<
  SubMenuState | undefined
>();
let popoverRef: HTMLDivElement | undefined;
let subMenuPopoverRef: HTMLDivElement | undefined;
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
  subMenuPopoverRef?.hidePopover();
  setSubMenuState(undefined);
  popoverRef?.hidePopover();
  setMenuState(undefined);
}

// For testing
export function _resetMenuState(): void {
  setMenuState(undefined);
  setSubMenuState(undefined);
}

// =============================================================================
// Provider component
// =============================================================================

export function PopoverMenuProvider() {
  let closeSubMenuTimeout: ReturnType<typeof setTimeout> | undefined;

  function handleItemClick(item: MenuItemClickable) {
    hideMenu();
    item.onClick();
  }

  function handleItemMouseEnter(
    item: MenuItem,
    index: number,
    element: HTMLElement,
  ) {
    // Clear any pending close timeout
    if (closeSubMenuTimeout !== undefined) {
      clearTimeout(closeSubMenuTimeout);
      closeSubMenuTimeout = undefined;
    }

    // Check if item has submenu
    if (item.type !== "divider" && "subMenu" in item && item.subMenu) {
      // Set anchor on this element
      element.style.setProperty("anchor-name", `--submenu-anchor-${index}`);

      // Show sub-menu
      setSubMenuState({
        parentItemIndex: index,
        items: item.subMenu,
      });

      // Show the sub-menu popover
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          subMenuPopoverRef?.showPopover();
        });
      });
    } else {
      // Close any open sub-menu
      subMenuPopoverRef?.hidePopover();
      setSubMenuState(undefined);
    }
  }

  function handleItemMouseLeave() {
    // Delay closing to allow mouse to move to sub-menu
    closeSubMenuTimeout = setTimeout(() => {
      subMenuPopoverRef?.hidePopover();
      setSubMenuState(undefined);
    }, 100);
  }

  function handleSubMenuMouseEnter() {
    // Cancel close timeout when entering sub-menu
    if (closeSubMenuTimeout !== undefined) {
      clearTimeout(closeSubMenuTimeout);
      closeSubMenuTimeout = undefined;
    }
  }

  function handleSubMenuMouseLeave() {
    // Close sub-menu when leaving
    subMenuPopoverRef?.hidePopover();
    setSubMenuState(undefined);
  }

  function handleClickOutside(e: MouseEvent) {
    if (!menuState()) return;
    const target = e.target as Node;
    const clickedInMenu = popoverRef?.contains(target);
    const clickedInSubMenu = subMenuPopoverRef?.contains(target);
    if (!clickedInMenu && !clickedInSubMenu) {
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
                {(item, index) => (
                  <Show
                    when={item.type !== "divider"}
                    fallback={<div class="bg-base-300 my-1 h-px" />}
                  >
                    {(() => {
                      let buttonRef: HTMLButtonElement | undefined;
                      const hasSubMenu = "subMenu" in item && !!item.subMenu;
                      return (
                        <button
                          ref={buttonRef}
                          type="button"
                          class="ui-hoverable flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50"
                          classList={{
                            "text-danger":
                              (item as MenuItemClickable).intent ===
                                "danger",
                            "ui-menu-item-with-submenu": hasSubMenu,
                          }}
                          disabled={(item as MenuItemClickable).disabled}
                          onClick={() => {
                            if (!hasSubMenu) {
                              handleItemClick(item as MenuItemClickable);
                            }
                          }}
                          onMouseEnter={() => {
                            if (buttonRef) {
                              handleItemMouseEnter(item, index(), buttonRef);
                            }
                          }}
                          onMouseLeave={handleItemMouseLeave}
                        >
                          <Show when={(item as MenuItemClickable).icon}>
                            {(icon) => (
                              <span class="w-4">
                                <IconRenderer iconName={icon()} />
                              </span>
                            )}
                          </Show>
                          <span class="flex-1">
                            {(item as MenuItemClickable).label}
                          </span>
                          <Show when={hasSubMenu}>
                            <span class="w-4 opacity-60">
                              <IconRenderer iconName="chevronRight" />
                            </span>
                          </Show>
                        </button>
                      );
                    })()}
                  </Show>
                )}
              </For>
            </div>
          )}
        </Show>
      </div>

      {/* Sub-menu popover */}
      <div
        ref={subMenuPopoverRef}
        popover="manual"
        class="ui-popover-submenu"
        data-position="right"
        style={subMenuState()
          ? ({
            "position-anchor": `--submenu-anchor-${
              subMenuState()!
                .parentItemIndex
            }`,
          } as JSX.CSSProperties)
          : undefined}
        onMouseEnter={handleSubMenuMouseEnter}
        onMouseLeave={handleSubMenuMouseLeave}
      >
        <Show when={subMenuState()} keyed>
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
                        "text-danger": (item as MenuItemClickable).intent ===
                          "danger",
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
