// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import type { AnchorRect } from "./popover_menu.tsx";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

// Singleton tooltip on the popover/anchor machinery: one TooltipProvider is
// mounted per app (next to PopoverMenuProvider) and everything shows through
// showTooltip/hideTooltip, so styling and timing are defined once, the bubble
// renders in the top layer (never buried or clipped), and the CSS
// position-try fallbacks flip it at viewport edges. Show is delayed; moving
// between tooltipped elements within the warm window shows instantly.

const SHOW_DELAY_MS = 500;
const WARM_WINDOW_MS = 300;
const ANCHOR_GAP_PX = 4;

type TooltipState = {
  content: string;
  position: TooltipPosition;
};

const [tooltipState, setTooltipState] = createSignal<
  TooltipState | undefined
>();
let popoverRef: HTMLDivElement | undefined;
let virtualAnchorRef: HTMLDivElement | undefined;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let warmUntil = 0;

export type ShowTooltipOptions = {
  anchor: AnchorRect;
  content: string;
  position?: TooltipPosition;
};

export function showTooltip(opts: ShowTooltipOptions): void {
  if (showTimer !== undefined) {
    clearTimeout(showTimer);
  }
  const delay = Date.now() < warmUntil ? 0 : SHOW_DELAY_MS;
  showTimer = setTimeout(() => {
    showTimer = undefined;
    if (virtualAnchorRef) {
      virtualAnchorRef.style.left = `${opts.anchor.x - ANCHOR_GAP_PX}px`;
      virtualAnchorRef.style.top = `${opts.anchor.y - ANCHOR_GAP_PX}px`;
      virtualAnchorRef.style.width = `${
        opts.anchor.width + ANCHOR_GAP_PX * 2
      }px`;
      virtualAnchorRef.style.height = `${
        opts.anchor.height + ANCHOR_GAP_PX * 2
      }px`;
    }
    setTooltipState({
      content: opts.content,
      position: opts.position ?? "right",
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        popoverRef?.showPopover();
      });
    });
  }, delay);
}

export function hideTooltip(): void {
  if (showTimer !== undefined) {
    clearTimeout(showTimer);
    showTimer = undefined;
  }
  if (tooltipState()) {
    warmUntil = Date.now() + WARM_WINDOW_MS;
  }
  popoverRef?.hidePopover();
  setTooltipState(undefined);
}

export function TooltipProvider() {
  return (
    <>
      <div
        ref={virtualAnchorRef}
        style={{
          "position": "fixed",
          "pointer-events": "none",
          "anchor-name": "--tooltip-anchor",
        } as JSX.CSSProperties}
      />
      <div
        ref={popoverRef}
        popover="manual"
        class="ui-popover"
        data-position={tooltipState()?.position ?? "right"}
        style={{ "position-anchor": "--tooltip-anchor" } as JSX.CSSProperties}
      >
        <Show when={tooltipState()} keyed>
          {(state) => (
            <div class="bg-base-content text-base-100 max-w-[280px] rounded px-2 py-1 text-sm shadow-floating">
              {state.content}
            </div>
          )}
        </Show>
      </div>
    </>
  );
}

export type TooltipProps = {
  content: string;
  position?: TooltipPosition;
  children: JSX.Element;
  disabled?: boolean;
};

export function Tooltip(p: TooltipProps): JSX.Element {
  let wrapperRef: HTMLDivElement | undefined;
  let showing = false;

  function handleMouseEnter() {
    if (p.disabled || !wrapperRef) {
      return;
    }
    showing = true;
    showTooltip({
      anchor: wrapperRef.getBoundingClientRect(),
      content: p.content,
      position: p.position,
    });
  }

  function handleMouseLeave() {
    showing = false;
    hideTooltip();
  }

  onCleanup(() => {
    if (showing) {
      hideTooltip();
    }
  });

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {p.children}
    </div>
  );
}
