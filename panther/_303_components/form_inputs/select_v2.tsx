// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { t3 } from "../deps.ts";
import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import { Icon } from "../icons/mod.ts";
import { hideTooltip, showTooltip } from "../special_state/tooltip.tsx";
import {
  isListItem,
  type ListEntry,
  type ListItem,
} from "../list_selection/list_item_types.ts";
import { CheckSvg } from "./_internal/check_glyphs.tsx";
import {
  ComboBoxPopover,
  createComboBoxPanel,
} from "./_internal/combo_box.tsx";
import { getSelectClasses } from "./_internal/input_classes.ts";
import {
  getListItemText,
  getNextActiveIndex,
  getTypeAheadIndex,
  isListboxNavKey,
} from "./_internal/listbox_keys.ts";
import { IconRenderer } from "./icon_renderer.tsx";
import { Field } from "./field.tsx";

const TYPE_AHEAD_RESET_MS = 500;

// fitContent sizes the trigger to its widest item; fullWidth to its parent.
// Asking for both is a contradiction, so the pair is a type error.
type SelectV2WidthProps =
  | { fullWidth?: boolean; fitContent?: false }
  | { fitContent: true; fullWidth?: false };

export type SelectV2Props<T extends string, M = never> =
  & {
    items: ListEntry<T, M>[];
    value: T | undefined;
    onChange: (v: T) => void;
    label?: string | JSX.Element;
    placeholder?: string;
    size?: "sm";
    mono?: boolean;
    disabled?: boolean;
    invalidMsg?: string;
    intent?: Intent;
  }
  & SelectV2WidthProps
  & DataAttrs;

// A single-select whose closed state is the Select skin and whose open state
// is the combo-box popover without the search box, over ListEntry rows
// (headers, dividers, sublabels, icons, disabled rows) with the native
// listbox keyboard model. Focus stays on the button trigger the whole time
// the panel is open: the panel never takes focus, so aria-activedescendant
// carries the active row.
export function SelectV2<T extends string, M = never>(
  p: SelectV2Props<T, M>,
) {
  const [dataAttrs] = splitDataAttrs(p);
  const [active, setActive] = createSignal<number | undefined>(undefined);
  const panel = createComboBoxPanel({
    onOpen: () => setActive(selectedIndex()),
  });
  const listId = `${panel.id}-list`;
  const optionId = (i: number) => `${panel.id}-option-${i}`;
  let listRef: HTMLDivElement | undefined;
  let closedLabelRef: HTMLSpanElement | undefined;
  let typeAheadBuffer = "";
  let typeAheadTimer: ReturnType<typeof setTimeout> | undefined;

  const selectedIndex = createMemo(() => {
    const i = p.items.findIndex((e) => isListItem(e) && e.id === p.value);
    return i === -1 ? undefined : i;
  });

  const selectedItem = createMemo(() => {
    const i = selectedIndex();
    if (i === undefined) {
      return undefined;
    }
    const entry = p.items[i];
    return isListItem(entry) ? entry : undefined;
  });

  const selectedText = createMemo(() => {
    const item = selectedItem();
    return item ? getListItemText(item) : undefined;
  });

  const activeDescendant = () => {
    const i = active();
    return panel.open() && i !== undefined ? optionId(i) : undefined;
  };

  // Closes in every case, as the native control does over a disabled selected
  // option; only an enabled item row changes the value.
  function commitIndex(i: number) {
    const entry = p.items[i];
    batch(() => {
      if (isListItem(entry) && !entry.disabled) {
        p.onChange(entry.id);
      }
      panel.closePanel();
    });
  }

  function pushTypeAhead(char: string) {
    if (typeAheadTimer !== undefined) {
      clearTimeout(typeAheadTimer);
    }
    typeAheadBuffer += char;
    typeAheadTimer = setTimeout(() => {
      typeAheadBuffer = "";
      typeAheadTimer = undefined;
    }, TYPE_AHEAD_RESET_MS);
    setActive(getTypeAheadIndex(p.items, active(), typeAheadBuffer));
  }

  onCleanup(() => {
    if (typeAheadTimer !== undefined) {
      clearTimeout(typeAheadTimer);
    }
  });

  function handleTriggerKeyDown(e: KeyboardEvent) {
    if (!panel.open()) {
      if (
        e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        panel.openPanel();
      }
      return;
    }
    if (e.key === "Escape") {
      // preventDefault as well as stopPropagation, for the reason the
      // controller's own Escape branch gives: the close watcher of an
      // enclosing <dialog> runs as the default action. The controller is not
      // delegated to because it also blurs, which is right for its readonly
      // input and wrong for a button that can reopen from the keyboard.
      e.preventDefault();
      e.stopPropagation();
      panel.closePanel();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const i = active();
      if (i === undefined) {
        panel.closePanel();
      } else {
        commitIndex(i);
      }
      return;
    }
    if (isListboxNavKey(e.key)) {
      e.preventDefault();
      setActive(getNextActiveIndex(p.items, active(), e.key));
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      pushTypeAhead(e.key);
    }
  }

  // Safari does not focus a button on click, and blur is what closes the
  // panel when the pointer goes elsewhere, so the trigger takes focus itself
  // before toggling.
  function handleTriggerPointerDown(
    e: PointerEvent & { currentTarget: HTMLButtonElement },
  ) {
    if (p.disabled) {
      return;
    }
    e.currentTarget.focus({ preventScroll: true });
    if (panel.open()) {
      panel.closePanel();
    } else {
      panel.openPanel();
    }
  }

  // Keeps the active row visible without delegating to scrollIntoView, whose
  // "nearest" walk climbs every ancestor scrolling box up to the viewport —
  // from inside a top-layer popover that means scrolling the page behind it
  // (which moves the anchor, so the panel follows and the row still never
  // comes into view). Scrolling the list box itself is the whole intent.
  function scrollActiveRowIntoView(i: number) {
    const row = document.getElementById(optionId(i));
    if (!listRef || !row || !row.isConnected) {
      return;
    }
    const list = listRef.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (rect.top < list.top) {
      listRef.scrollTop += rect.top - list.top;
    } else if (rect.bottom > list.bottom) {
      listRef.scrollTop += rect.bottom - list.bottom;
    }
  }

  // rAF (not a microtask) so the anchored panel has been laid out before the
  // rects are read.
  createEffect(() => {
    const isOpen = panel.open();
    const i = active();
    if (isOpen && i !== undefined) {
      requestAnimationFrame(() => scrollActiveRowIntoView(i));
    }
  });

  function showTruncationTooltip(
    anchor: HTMLElement,
    labelEl: HTMLElement | undefined,
    text: string | undefined,
  ) {
    if (text && labelEl && labelEl.scrollWidth > labelEl.clientWidth) {
      showTooltip({
        anchor: anchor.getBoundingClientRect(),
        content: text,
        position: "right",
        size: "sm",
      });
    }
  }

  return (
    <Field
      {...dataAttrs}
      label={p.label}
      labelFor={panel.id}
      intent={p.intent}
      invalidMsg={p.invalidMsg}
      width={p.fitContent ? "w-fit" : "w-[200px]"}
      fullWidth={p.fullWidth}
    >
      <div
        ref={panel.setWrapperRef}
        class="ui-form-text relative w-full"
        style={{ "anchor-name": panel.anchorName } as JSX.CSSProperties}
      >
        <button
          id={panel.id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={panel.open()}
          aria-controls={listId}
          aria-activedescendant={activeDescendant()}
          aria-invalid={!!p.invalidMsg}
          class={`${
            getSelectClasses(p.size, false, undefined)
          } text-left data-[panel-side=bottom]:rounded-b-none data-[panel-side=top]:rounded-t-none`}
          data-mono={p.mono}
          data-invalid={!!p.invalidMsg}
          data-placeholder={!selectedItem()}
          data-open={panel.open()}
          data-panel-side={panel.open() ? panel.side() : undefined}
          disabled={p.disabled}
          onPointerDown={handleTriggerPointerDown}
          onBlur={panel.handleBlur}
          onKeyDown={handleTriggerKeyDown}
          onMouseEnter={(e) =>
            showTruncationTooltip(
              e.currentTarget,
              closedLabelRef,
              selectedText(),
            )}
          onMouseLeave={hideTooltip}
        >
          {
            /* One grid cell: the visible label sits over an invisible copy of
              every item's text when fitContent, so the widest item sets the
              width and the trigger never resizes when the value changes. */
          }
          <span class="grid">
            <span
              ref={closedLabelRef}
              class="col-start-1 row-start-1 min-w-0 truncate"
            >
              <Show
                when={selectedItem()}
                fallback={p.placeholder ??
                  t3({
                    en: "Select...",
                    fr: "Sélectionner...",
                    pt: "Selecionar...",
                  })}
              >
                {(item) => item().label}
              </Show>
            </span>
            <Show when={p.fitContent}>
              <For each={p.items}>
                {(entry) => (
                  <Show when={isListItem(entry) && entry}>
                    {(item) => (
                      <span
                        class="invisible col-start-1 row-start-1 whitespace-nowrap"
                        aria-hidden="true"
                      >
                        {getListItemText(item())}
                      </span>
                    )}
                  </Show>
                )}
              </For>
            </Show>
          </span>
        </button>
        <div class="text-base-content pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center">
          <Icon iconName="selector" />
        </div>
      </div>
      <ComboBoxPopover panel={panel}>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          class="flex-1 overflow-y-auto overscroll-contain p-1"
        >
          <For each={p.items}>
            {(entry, i) => {
              if (!isListItem(entry)) {
                if ("divider" in entry) {
                  return <div role="presentation" class="my-1 border-b" />;
                }
                return (
                  <div
                    role="presentation"
                    class="text-base-content-muted px-2 py-1 text-xs font-700"
                  >
                    {entry.header}
                  </div>
                );
              }
              return (
                <OptionRow
                  item={entry}
                  id={optionId(i())}
                  selected={entry.id === p.value}
                  active={i() === active()}
                  mono={p.mono}
                  onActivate={() => setActive(i())}
                  onCommit={() => commitIndex(i())}
                  showTruncationTooltip={showTruncationTooltip}
                />
              );
            }}
          </For>
        </div>
      </ComboBoxPopover>
    </Field>
  );
}

type OptionRowProps<T extends string, M> = {
  item: ListItem<T, M>;
  id: string;
  selected: boolean;
  active: boolean;
  mono?: boolean;
  onActivate: () => void;
  onCommit: () => void;
  showTruncationTooltip: (
    anchor: HTMLElement,
    labelEl: HTMLElement | undefined,
    text: string | undefined,
  ) => void;
};

// The active row pins the hover surface and the other rows carry the family
// class, one arm or the other, never both: pointer hover sets active, so the
// pinned surface and the pointer agree on one highlight. A disabled row has
// neither: it is not an interactive surface.
function OptionRow<T extends string, M>(p: OptionRowProps<T, M>) {
  let labelRef: HTMLSpanElement | undefined;
  const isDisabled = () => p.item.disabled === true;

  return (
    <div
      id={p.id}
      role="option"
      aria-selected={p.selected}
      aria-disabled={isDisabled() ? true : undefined}
      class="flex items-center gap-2 rounded px-2 py-1 text-sm"
      classList={{
        "ui-hoverable-base-100": !isDisabled() && !p.active,
        "bg-base-100-hover cursor-pointer select-none": !isDisabled() &&
          p.active,
        "opacity-40": isDisabled(),
      }}
      onClick={() => {
        if (!isDisabled()) {
          p.onCommit();
        }
      }}
      onMouseEnter={(e) => {
        if (!isDisabled()) {
          p.onActivate();
        }
        p.showTruncationTooltip(
          e.currentTarget,
          labelRef,
          getListItemText(p.item),
        );
      }}
      onMouseLeave={hideTooltip}
    >
      {
        /* A bare check, not the multi peer's check square: a square is a
          checkbox affordance (it can be un-checked), and a single-select row
          cannot be un-picked. The gutter matches the peer's square so labels
          align across the combo-boxes. */
      }
      <span class="relative h-4 w-4 flex-none">
        <Show when={p.selected}>
          <CheckSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
        </Show>
      </span>
      <IconRenderer iconName={p.item.iconName} />
      <span class="flex min-w-0 flex-1 flex-col">
        <span
          ref={labelRef}
          class="truncate data-[mono=true]:font-mono"
          data-mono={p.mono}
        >
          {p.item.label}
        </span>
        <Show when={p.item.sublabel}>
          <span class="text-base-content-muted truncate text-xs">
            {p.item.sublabel}
          </span>
        </Show>
      </span>
    </div>
  );
}
