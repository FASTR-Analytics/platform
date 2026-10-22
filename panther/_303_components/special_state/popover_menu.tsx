// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Button } from "../form_inputs/button.tsx";
import type { IconName } from "../icons/mod.ts";
import { IconRenderer } from "../form_inputs/icon_renderer.tsx";
import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";

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

export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShowMenuOptions = {
  anchor: AnchorRect;
  position?: PopoverPosition;
  items: MenuItem[];
};

type MenuState = {
  position: PopoverPosition;
  items: MenuItem[];
};

type SubMenuState = {
  parentItemIndex: number;
  items: MenuItem[];
};

const [menuState, setMenuState] = createSignal<MenuState | undefined>();
const [subMenuState, setSubMenuState] = createSignal<
  SubMenuState | undefined
>();
let popoverRef: HTMLDivElement | undefined;
let subMenuPopoverRef: HTMLDivElement | undefined;
let virtualAnchorRef: HTMLDivElement | undefined;

export function showMenu(opts: ShowMenuOptions): void {
  popoverRef?.hidePopover();

  const position = opts.position ?? "bottom-start";

  setMenuState({
    position,
    items: opts.items,
  });

  if (virtualAnchorRef) {
    const GAP = 6;
    virtualAnchorRef.style.left = `${opts.anchor.x}px`;
    virtualAnchorRef.style.top = `${opts.anchor.y - GAP}px`;
    virtualAnchorRef.style.width = `${opts.anchor.width}px`;
    virtualAnchorRef.style.height = `${opts.anchor.height + GAP * 2}px`;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popoverRef?.showPopover();
    });
  });
}

function hideMenu(): void {
  batch(() => {
    subMenuPopoverRef?.hidePopover();
    setSubMenuState(undefined);
    popoverRef?.hidePopover();
    setMenuState(undefined);
  });
}

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
            <div class="bg-base-100 min-w-[160px] overflow-hidden rounded border shadow-floating">
              <For each={state.items}>
                {(item, index) => (
                  <Show
                    when={item.type !== "divider"}
                    fallback={<div class="bg-border my-1 h-px" />}
                  >
                    {(() => {
                      let buttonRef: HTMLButtonElement | undefined;
                      const hasSubMenu = "subMenu" in item && !!item.subMenu;
                      return (
                        <button
                          ref={buttonRef}
                          type="button"
                          class="ui-hoverable-base-100 flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40"
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
            <div class="bg-base-100 min-w-[160px] overflow-hidden rounded border shadow-floating">
              <For each={state.items}>
                {(item) => (
                  <Show
                    when={item.type !== "divider"}
                    fallback={<div class="bg-border my-1 h-px" />}
                  >
                    <button
                      type="button"
                      class="ui-hoverable-base-100 flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40"
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

export type MenuButtonProps = {
  items: MenuItem[] | (() => MenuItem[]);
  position?: PopoverPosition;
  children?: JSX.Element;
  iconName?: IconName;
  iconPosition?: "left" | "right";
  intent?: Intent;
  outline?: boolean;
  onBackground?: Intent;
  size?: "sm";
  fullWidth?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
} & DataAttrs;

// A Button that opens a menu anchored to itself. Styled like any Button; the
// menu items may be a function, read at open time. A right-click context menu
// is showMenu, not this.
export function MenuButton(p: MenuButtonProps): JSX.Element {
  const [dataAttrs] = splitDataAttrs(p);
  return (
    <Button
      {...dataAttrs}
      id={p.id}
      iconName={p.iconName}
      iconPosition={p.iconPosition}
      intent={p.intent}
      outline={p.outline}
      onBackground={p.onBackground}
      size={p.size}
      fullWidth={p.fullWidth}
      disabled={p.disabled}
      ariaLabel={p.ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        showMenu({
          anchor: e.currentTarget.getBoundingClientRect(),
          position: p.position ?? "bottom-start",
          items: typeof p.items === "function" ? p.items() : p.items,
        });
      }}
    >
      {p.children}
    </Button>
  );
}

export type ActionMenuButtonProps = {
  items: MenuItem[] | (() => MenuItem[]);
  intent?: Intent;
  outline?: boolean;
  onBackground?: Intent;
  size?: "sm";
  id?: string;
} & DataAttrs;

// The three-dots button that opens a screen's occasional actions: a
// MenuButton whose icon, bottom-end placement and accessible name are fixed.
export function ActionMenuButton(p: ActionMenuButtonProps): JSX.Element {
  return (
    <MenuButton
      {...p}
      iconName="moreVertical"
      position="bottom-end"
      ariaLabel="More actions"
    />
  );
}
