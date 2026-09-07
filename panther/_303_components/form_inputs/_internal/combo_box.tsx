// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createSignal,
  createUniqueId,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { t3 } from "../../deps.ts";
import { Icon } from "../../icons/mod.ts";
import { hideTooltip } from "../../special_state/tooltip.tsx";
import type { SelectOption } from "../types.ts";
import { getSelectClasses } from "./input_classes.ts";

// Search matches string labels; JSX labels fall back to the option value.
export function getSearchText<T extends string>(opt: SelectOption<T>): string {
  return typeof opt.label === "string" ? opt.label : opt.value;
}

const MARGIN_PX = 8;
const HEIGHT_CAP_PX = 400;
const MIN_HEIGHT_PX = 120;

export type ComboBoxPanelController = {
  id: string;
  anchorName: string;
  open: () => boolean;
  side: () => "bottom" | "top";
  panelMaxHeight: () => number;
  query: () => string;
  openPanel: () => void;
  closePanel: () => void;
  handleBlur: (e: FocusEvent) => void;
  handleKeyDown: (
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) => void;
  handleInput: (value: string) => void;
  setWrapperRef: (el: HTMLDivElement) => void;
  setPanelRef: (el: HTMLDivElement) => void;
};

// The open/close mechanism shared by SelectSearch and MultiSelectSearch. It is
// a manual popover: open/close is driven by focus/blur/Escape on the trigger
// input, never by light dismiss. The panel's side (below/above) and max height
// are measured once at open and pinned (ComboBoxFrame sets data-pinned, which
// disables the CSS position-try fallbacks), so the corners where trigger and
// panel meet can be squared off into one seamless unit and nothing flips or
// jumps while the user types.
//
// onOpen runs inside the same batch as the state flip, for per-component setup
// that must land before the panel's first render (the multi peer snapshots its
// selection there so rows don't reorder mid-toggle).
export function createComboBoxPanel(
  opts?: { onOpen?: () => void },
): ComboBoxPanelController {
  const id = createUniqueId();
  const anchorName = `--combo-box-anchor-${id}`;
  let wrapperRef: HTMLDivElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  const [open, setOpen] = createSignal<boolean>(false);
  const [side, setSide] = createSignal<"bottom" | "top">("bottom");
  const [panelMaxHeight, setPanelMaxHeight] = createSignal<number>(
    HEIGHT_CAP_PX,
  );
  const [query, setQuery] = createSignal<string>("");

  function openPanel() {
    if (open() || !wrapperRef) {
      return;
    }
    const rect = wrapperRef.getBoundingClientRect();
    const spaceBelow = globalThis.innerHeight - rect.bottom - MARGIN_PX;
    const spaceAbove = rect.top - MARGIN_PX;
    const chosenSide = spaceBelow >= Math.min(HEIGHT_CAP_PX, spaceAbove)
      ? "bottom"
      : "top";
    const maxHeight = Math.max(
      Math.min(
        HEIGHT_CAP_PX,
        chosenSide === "bottom" ? spaceBelow : spaceAbove,
      ),
      MIN_HEIGHT_PX,
    );
    hideTooltip();
    batch(() => {
      setSide(chosenSide);
      setPanelMaxHeight(maxHeight);
      setQuery("");
      opts?.onOpen?.();
      setOpen(true);
    });
    panelRef?.showPopover();
  }

  function closePanel() {
    if (!open()) {
      return;
    }
    hideTooltip();
    // Flip the signal BEFORE hiding: hidePopover() throws InvalidStateError if
    // the element is no longer showing (disconnected while open), and a throw
    // after the call would strand open() true — input stuck in search mode,
    // no panel, no way back.
    setOpen(false);
    if (panelRef?.matches(":popover-open")) {
      panelRef.hidePopover();
    }
  }

  function handleBlur(e: FocusEvent) {
    const rt = e.relatedTarget;
    if (
      rt instanceof Node &&
      (wrapperRef?.contains(rt) || panelRef?.contains(rt))
    ) {
      return;
    }
    closePanel();
  }

  function handleKeyDown(
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (!open()) {
      return;
    }
    if (e.key === "Escape") {
      // preventDefault as well as stopPropagation: an enclosing <dialog> or
      // popover=auto closes on Escape via the close watcher, which runs as the
      // event's DEFAULT ACTION — stopPropagation does not stop it, so without
      // this, dismissing the panel also dismisses the modal around it.
      e.preventDefault();
      e.stopPropagation();
      closePanel();
      // Blur too: on close the input flips back to readonly, and a readonly
      // input emits no input events and cannot re-fire focus while it still
      // holds it — keeping focus here leaves a keyboard user with no way to
      // reopen the panel short of reaching for the pointer.
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Enter") {
      // This is a real text input; inside a <form> a bare Enter would submit
      // the form while the user is only filtering the list.
      e.preventDefault();
    }
  }

  function handleInput(value: string) {
    batch(() => {
      if (!open()) {
        openPanel();
      }
      setQuery(value);
    });
  }

  // The tooltip is a module-level singleton with a delayed show, so an unmount
  // that does not route through closePanel (route change, a <Show> flipping,
  // a modal closing from elsewhere) would otherwise leave a bubble on screen
  // or pop one up anchored to a row that no longer exists.
  onCleanup(hideTooltip);

  return {
    id,
    anchorName,
    open,
    side,
    panelMaxHeight,
    query,
    openPanel,
    closePanel,
    handleBlur,
    handleKeyDown,
    handleInput,
    setWrapperRef: (el) => wrapperRef = el,
    setPanelRef: (el) => panelRef = el,
  };
}

type ComboBoxFrameProps = {
  panel: ComboBoxPanelController;
  // The closed-state display string: the selected label (single) or the
  // selection summary (multi). Drives the placeholder swap, and gates the
  // overlay. Undefined means nothing is selected.
  displayText?: string;
  // Painted over the closed input rather than written into it as a value:
  // the input keeps focus across a row click, and setting value on a focused
  // input parks the caret at the end, so the box would scroll to the tail of a
  // long label and drop its ellipsis. An overlay span also makes a truncation
  // test exact — it measures zero padding, not an input padded by 2.5em of
  // chevron. Rendered only while closed and only when displayText is set.
  overlay?: JSX.Element;
  label?: string | JSX.Element;
  placeholder?: string;
  fullWidth?: boolean;
  size?: "sm";
  mono?: boolean;
  disabled?: boolean;
  invalidMsg?: string;
  onTriggerMouseEnter?: (
    e: MouseEvent & { currentTarget: HTMLInputElement },
  ) => void;
  // The panel body, created only while the panel is open. The caller owns the
  // scroll container (and any header row above it) so it can hold its own ref
  // and roles.
  children: JSX.Element;
};

// The shared chrome: label, the anchored trigger input that doubles as the
// search box, the closed-state overlay, the chevron/search glyph, the invalid
// message, and the anchored popover surface the caller fills.
export function ComboBoxFrame(p: ComboBoxFrameProps) {
  const panel = () => p.panel;

  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show when={p.label}>
        <label class="ui-label" for={panel().id}>
          {p.label}
        </label>
      </Show>
      <div
        ref={panel().setWrapperRef}
        class="ui-form-text relative w-full"
        style={{ "anchor-name": panel().anchorName } as JSX.CSSProperties}
      >
        <input
          id={panel().id}
          type="text"
          role="combobox"
          aria-expanded={panel().open()}
          aria-autocomplete="list"
          aria-invalid={!!p.invalidMsg}
          class={`${
            getSelectClasses(p.size, false, undefined)
          } data-[open=true]:cursor-text data-[panel-side=bottom]:rounded-b-none data-[panel-side=top]:rounded-t-none`}
          data-mono={p.mono}
          data-invalid={!!p.invalidMsg}
          data-open={panel().open()}
          data-panel-side={panel().open() ? panel().side() : undefined}
          readonly={!panel().open()}
          disabled={p.disabled}
          value={panel().open() ? panel().query() : ""}
          placeholder={panel().open()
            ? p.displayText ??
              t3({ en: "Search...", fr: "Rechercher...", pt: "Pesquisar..." })
            : p.displayText
            ? ""
            : p.placeholder ??
              t3({
                en: "Select...",
                fr: "Sélectionner...",
                pt: "Selecionar...",
              })}
          onFocus={panel().openPanel}
          onPointerDown={panel().openPanel}
          onBlur={panel().handleBlur}
          onKeyDown={panel().handleKeyDown}
          onInput={(e) =>
            panel().handleInput(e.currentTarget.value)}
          onMouseEnter={(e) =>
            p.onTriggerMouseEnter?.(e)}
          onMouseLeave={hideTooltip}
        />
        <Show when={!panel().open() && p.displayText}>
          <div
            class={`${
              p.size === "sm"
                ? "ui-form-pad-sm ui-form-text-size-sm"
                : "ui-form-pad ui-form-text-size"
            } text-base-content pointer-events-none absolute inset-0 flex items-center border border-transparent !pr-[2.5em] font-400 data-[mono=true]:font-mono`}
            data-mono={p.mono}
          >
            {p.overlay}
          </div>
        </Show>
        <div class="text-base-content pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center">
          <Icon iconName={panel().open() ? "search" : "selector"} />
        </div>
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
      <div
        ref={panel().setPanelRef}
        popover="manual"
        class="ui-popover"
        data-position={panel().side() === "bottom"
          ? "bottom-start"
          : "top-start"}
        data-pinned="true"
        style={{
          "position-anchor": panel().anchorName,
          "width": "anchor-size(width)",
        } as JSX.CSSProperties}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Show when={panel().open()}>
          <div
            class="bg-base-100 flex w-full flex-col overflow-hidden rounded border shadow-floating data-[side=bottom]:rounded-t-none data-[side=bottom]:border-t-0 data-[side=top]:rounded-b-none data-[side=top]:border-b-0"
            data-side={panel().side()}
            style={{ "max-height": `${panel().panelMaxHeight()}px` }}
          >
            {p.children}
          </div>
        </Show>
      </div>
    </div>
  );
}
