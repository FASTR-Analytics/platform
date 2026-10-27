// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createMemo,
  createSignal,
  createUniqueId,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { foldString, matchesSearch, searchTokens, t3 } from "../../deps.ts";
import { Icon } from "../../icons/mod.ts";
import { hideTooltip } from "../../special_state/tooltip.tsx";
import type { SelectOption } from "../types.ts";
import { getSelectClasses } from "./input_classes.ts";
import { Field } from "../field.tsx";

// Search matches string labels; JSX labels fall back to the option value.
export function getSearchText<T extends string>(opt: SelectOption<T>): string {
  return typeof opt.label === "string" ? opt.label : opt.value;
}

// Option text is folded once per change of the options, not per keystroke.
export function createFilteredOptions<T extends string>(
  options: () => SelectOption<T>[],
  query: () => string,
): () => SelectOption<T>[] {
  const folded = createMemo(() =>
    options().map((opt) => foldString(getSearchText(opt)))
  );
  return createMemo(() => {
    const tokens = searchTokens(query());
    const opts = options();
    if (tokens.length === 0) {
      return opts;
    }
    const haystacks = folded();
    return opts.filter((_, i) => matchesSearch(haystacks[i], tokens));
  });
}

const MARGIN_PX = 8;
// Panel and trigger count as the same width within this much. anchor-size()
// and getBoundingClientRect disagree in the last fraction, and a fitContent
// trigger fits the selected label where the panel fits the widest row, so the
// two land a pixel apart on padding alone. Below the tolerance there is no
// overhang worth drawing a border along.
const FLUSH_TOLERANCE_PX = 2;
const HEIGHT_CAP_PX = 400;
const MIN_HEIGHT_PX = 120;

export type ComboBoxPanelController = {
  id: string;
  anchorName: string;
  open: () => boolean;
  side: () => "bottom" | "top";
  // Which edges of trigger and panel line up. Always "start" for a
  // trigger-width panel; a content-width one flips to "end" when it would
  // otherwise cross the right edge of the viewport.
  align: () => "start" | "end";
  // The panel is within FLUSH_TOLERANCE_PX of the trigger's width, so the two
  // can be drawn as one unit with the meeting border dropped.
  flush: () => boolean;
  width: "trigger" | "content";
  panelMaxHeight: () => number;
  query: () => string;
  openPanel: () => void;
  closePanel: () => void;
  handleBlur: (e: FocusEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleInput: (value: string) => void;
  setWrapperRef: (el: HTMLDivElement) => void;
  setInputRef: (el: HTMLInputElement) => void;
  setPanelRef: (el: HTMLDivElement) => void;
};

// The open/close mechanism shared by SelectSearch and MultiSelectSearch. It is
// a manual popover: open/close is driven by focus/blur/Escape on the trigger
// input, never by light dismiss. The panel's side (below/above) and max height
// are measured once at open and pinned (ComboBoxPopover sets data-pinned, which
// disables the CSS position-try fallbacks), so the corners where trigger and
// panel meet can be squared off into one seamless unit and nothing flips or
// jumps while the user types.
//
// onOpen runs inside the same batch as the state flip, for per-component setup
// that must land before the panel's first render (the multi peer snapshots its
// selection there so rows don't reorder mid-toggle).
export function createComboBoxPanel(
  opts: { width: "trigger" | "content"; onOpen?: () => void },
): ComboBoxPanelController {
  const id = createUniqueId();
  const anchorName = `--combo-box-anchor-${id}`;
  let wrapperRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let panelRef: HTMLDivElement | undefined;

  const [open, setOpen] = createSignal<boolean>(false);
  const [side, setSide] = createSignal<"bottom" | "top">("bottom");
  const [align, setAlign] = createSignal<"start" | "end">("start");
  const [flush, setFlush] = createSignal<boolean>(true);
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
      setAlign("start");
      setFlush(true);
      setQuery("");
      opts.onOpen?.();
      setOpen(true);
    });
    panelRef?.showPopover();
    // The width of a content-width panel is decided by CSS, so it can only be
    // read once the panel is laid out. One frame, one re-layout, and then the
    // side, the alignment and the joint are all pinned for as long as the
    // panel is open: nothing may flip or jump while the user types.
    if (opts.width === "content") {
      requestAnimationFrame(measureWidth);
    }
  }

  function measureWidth() {
    if (!open() || !panelRef || !wrapperRef) {
      return;
    }
    const trigger = wrapperRef.getBoundingClientRect();
    const panel = panelRef.getBoundingClientRect();
    batch(() => {
      setFlush(panel.width - trigger.width <= FLUSH_TOLERANCE_PX);
      const overflowsRight = panel.right > globalThis.innerWidth - MARGIN_PX;
      // Only worth flipping if the panel then reaches the trigger's right
      // edge. A panel already capped by max-width does not: end alignment
      // would shift it off the trigger altogether, leaving the squared corner
      // marking a joint that is not there, where start alignment at least
      // keeps its left edge on the trigger and clips only the row tails.
      const fitsEndAligned = trigger.right - panel.width >= MARGIN_PX;
      if (overflowsRight && fitsEndAligned) {
        setAlign("end");
      }
    });
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

  // Bound with a native on:keydown, not Solid's onKeyDown: keydown is a
  // delegated event, so a Solid handler already runs at the document beside
  // AlertProvider's own keydown listener and cannot stop it.
  function handleKeyDown(e: KeyboardEvent) {
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
      inputRef?.blur();
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
    align,
    flush,
    width: opts.width,
    panelMaxHeight,
    query,
    openPanel,
    closePanel,
    handleBlur,
    handleKeyDown,
    handleInput,
    setWrapperRef: (el) => wrapperRef = el,
    setInputRef: (el) => inputRef = el,
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
  children: JSX.Element;
};

// The shared chrome: label, the anchored trigger input that doubles as the
// search box, the closed-state overlay, the chevron/search glyph, the invalid
// message, and the anchored popover surface the caller fills.
export function ComboBoxFrame(p: ComboBoxFrameProps) {
  const panel = () => p.panel;

  return (
    <Field
      label={p.label}
      labelFor={panel().id}
      invalidMsg={p.invalidMsg}
      width="w-[200px]"
      fullWidth={p.fullWidth}
    >
      <div
        ref={panel().setWrapperRef}
        class="ui-form-text relative w-full"
        style={{ "anchor-name": panel().anchorName } as JSX.CSSProperties}
      >
        <input
          ref={panel().setInputRef}
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
              t3({
                en: "Search...",
                fr: "Rechercher...",
                pt: "Pesquisar...",
                th: "ค้นหา...",
              })
            : p.displayText
            ? ""
            : p.placeholder ??
              t3({
                en: "Select...",
                fr: "Sélectionner...",
                pt: "Selecionar...",
                th: "เลือก...",
              })}
          onFocus={panel().openPanel}
          onPointerDown={panel().openPanel}
          onBlur={panel().handleBlur}
          on:keydown={panel().handleKeyDown}
          onInput={(e) => panel().handleInput(e.currentTarget.value)}
          onMouseEnter={(e) => p.onTriggerMouseEnter?.(e)}
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
      <ComboBoxPopover panel={panel()}>{p.children}</ComboBoxPopover>
    </Field>
  );
}

type ComboBoxPopoverProps = {
  panel: ComboBoxPanelController;
  // The panel body, created only while the panel is open. The caller owns the
  // scroll container (and any header row above it) so it can hold its own ref
  // and roles.
  children: JSX.Element;
};

// A content-width panel is at least the trigger, grows to its widest row, and
// stops at the viewport less the margin the side and height measurements
// already keep. Rows stay truncated for the case where that cap bites.
function widthStyle(width: "trigger" | "content"): Record<string, string> {
  if (width === "trigger") {
    return { "width": "anchor-size(width)" };
  }
  return {
    "min-width": "anchor-size(width)",
    "width": "max-content",
    "max-width": `calc(100vw - ${MARGIN_PX * 2}px)`,
  };
}

// The anchored top-layer surface: a manual popover pinned to the trigger's
// anchor at the width the controller asks for, whose inner panel squares off
// the corners where it meets the trigger. ComboBoxFrame renders it under its
// input; a trigger that is not that input renders it directly. The controller
// decides the side, the alignment and the height cap. mousedown is prevented
// so a click inside the panel never moves focus off the trigger.
export function ComboBoxPopover(p: ComboBoxPopoverProps) {
  const panel = () => p.panel;

  return (
    <div
      ref={panel().setPanelRef}
      popover="manual"
      class="ui-popover"
      data-position={`${panel().side()}-${panel().align()}`}
      data-pinned="true"
      style={{
        "position-anchor": panel().anchorName,
        ...widthStyle(panel().width),
      } as JSX.CSSProperties}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Show when={panel().open()}>
        {
          /* text-base-content is set here because the UA stylesheet gives
            [popover] color: CanvasText, which .ui-popover does not reset, so
            without it rows render in the system colour, not the token. */
        }
        {
          /* The joint with the trigger. Flush, the two are one unit: the
            meeting border is dropped and both meeting corners squared. Wider,
            the panel keeps its own border and squares only the corner on the
            aligned side, so the far corner stays rounded rather than leaving a
            borderless edge hanging past the trigger. */
        }
        <div
          class="bg-base-100 text-base-content flex w-full flex-col overflow-hidden rounded border shadow-floating data-[joint=bottom-flush]:rounded-t-none data-[joint=bottom-flush]:border-t-0 data-[joint=top-flush]:rounded-b-none data-[joint=top-flush]:border-b-0 data-[joint=bottom-start]:rounded-tl-none data-[joint=bottom-end]:rounded-tr-none data-[joint=top-start]:rounded-bl-none data-[joint=top-end]:rounded-br-none"
          data-joint={panel().flush()
            ? `${panel().side()}-flush`
            : `${panel().side()}-${panel().align()}`}
          style={{ "max-height": `${panel().panelMaxHeight()}px` }}
        >
          {p.children}
        </div>
      </Show>
    </div>
  );
}
