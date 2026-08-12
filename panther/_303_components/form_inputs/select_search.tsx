// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  Show,
} from "solid-js";
import { t3 } from "../deps.ts";
import { Icon } from "../icons/mod.ts";
import { hideTooltip, showTooltip } from "../special_state/tooltip.tsx";
import type { SelectOption } from "./types.ts";
import { CheckSvg } from "./_internal/check_glyphs.tsx";
import { getSelectClasses } from "./_internal/input_classes.ts";

type SelectSearchProps<T extends string> = {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label?: string | JSX.Element;
  placeholder?: string;
  fullWidth?: boolean;
  size?: "sm";
  mono?: boolean;
  disabled?: boolean;
  invalidMsg?: string;
};

// Search matches string labels; JSX labels fall back to the option value.
function getSearchText<T extends string>(opt: SelectOption<T>): string {
  return typeof opt.label === "string" ? opt.label : opt.value;
}

// Combo-box single-select: the searchable peer of Select, built on the same
// panel mechanics as MultiSelectSearch. The closed control is a select-styled
// input showing the selected label; focusing it turns it into the search input
// in place (so the cursor never moves) and opens an anchored popover holding
// the option list. The panel is a manual popover: open/close is driven by
// focus/blur/Escape on the input, and mousedown inside the panel is prevented
// so row clicks never steal focus from the input. The panel matches the
// trigger width and its side (below/above) and max height are measured once at
// open and pinned (data-pinned disables the CSS position-try fallbacks), so
// the meeting corners can be squared off into one seamless unit and nothing
// flips or jumps while the user types. Unlike the multi peer, options keep
// their given order (there is nothing to pin to the top) and picking a row
// commits the value and closes the panel.
export function SelectSearch<T extends string>(p: SelectSearchProps<T>) {
  const id = createUniqueId();
  const anchorName = `--select-search-anchor-${id}`;
  let panelRef: HTMLDivElement | undefined;
  let wrapperRef: HTMLDivElement | undefined;
  let inputRef: HTMLInputElement | undefined;
  let didScrollToSelected = false;

  const [open, setOpen] = createSignal<boolean>(false);
  const [side, setSide] = createSignal<"bottom" | "top">("bottom");
  const [panelMaxHeight, setPanelMaxHeight] = createSignal<number>(400);
  const [query, setQuery] = createSignal<string>("");

  const selectedOption = createMemo(() =>
    p.options.find((opt) => opt.value === p.value)
  );

  const selectedText = createMemo(() => {
    const opt = selectedOption();
    return opt ? getSearchText(opt) : undefined;
  });

  const filteredOptions = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) {
      return p.options;
    }
    return p.options.filter((opt) =>
      getSearchText(opt).toLowerCase().includes(q)
    );
  });

  function selectValue(value: T) {
    p.onChange(value);
    closePanel();
  }

  function openPanel() {
    if (open() || !wrapperRef) {
      return;
    }
    const MARGIN = 8;
    const HEIGHT_CAP = 400;
    const rect = wrapperRef.getBoundingClientRect();
    const spaceBelow = globalThis.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const chosenSide = spaceBelow >= Math.min(HEIGHT_CAP, spaceAbove)
      ? "bottom"
      : "top";
    const maxHeight = Math.max(
      Math.min(HEIGHT_CAP, chosenSide === "bottom" ? spaceBelow : spaceAbove),
      120,
    );
    hideTooltip();
    didScrollToSelected = false;
    batch(() => {
      setSide(chosenSide);
      setPanelMaxHeight(maxHeight);
      setQuery("");
      setOpen(true);
    });
    panelRef?.showPopover();
  }

  function closePanel() {
    if (!open()) {
      return;
    }
    hideTooltip();
    panelRef?.hidePopover();
    setOpen(false);
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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && open()) {
      e.stopPropagation();
      closePanel();
    }
  }

  function handleInput(value: string) {
    if (!open()) {
      openPanel();
    }
    setQuery(value);
  }

  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show when={p.label}>
        <label class="ui-label">{p.label}</label>
      </Show>
      <div
        ref={wrapperRef}
        class="ui-form-text relative w-full"
        style={{ "anchor-name": anchorName } as JSX.CSSProperties}
      >
        <input
          ref={inputRef}
          type="text"
          class={`${
            getSelectClasses(p.size, false, undefined)
          } data-[open=true]:cursor-text data-[panel-side=bottom]:rounded-b-none data-[panel-side=top]:rounded-t-none`}
          data-mono={p.mono}
          data-invalid={!!p.invalidMsg}
          data-open={open()}
          data-panel-side={open() ? side() : undefined}
          readonly={!open()}
          disabled={p.disabled}
          value={open() ? query() : selectedText() ?? ""}
          placeholder={open()
            ? selectedText() ??
              t3({ en: "Search...", fr: "Rechercher...", pt: "Pesquisar..." })
            : p.placeholder ??
              t3({
                en: "Select...",
                fr: "Sélectionner...",
                pt: "Selecionar...",
              })}
          onFocus={openPanel}
          onPointerDown={openPanel}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onInput={(e) =>
            handleInput(e.currentTarget.value)}
          onMouseEnter={(e) => {
            const text = selectedText();
            if (
              !open() && text && inputRef &&
              inputRef.scrollWidth > inputRef.clientWidth
            ) {
              showTooltip({
                anchor: e.currentTarget.getBoundingClientRect(),
                content: text,
                position: "right",
                size: "sm",
              });
            }
          }}
          onMouseLeave={hideTooltip}
        />
        <div class="text-base-content pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center">
          <Icon iconName={open() ? "search" : "selector"} />
        </div>
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
      <div
        ref={panelRef}
        popover="manual"
        class="ui-popover"
        data-position={side() === "bottom" ? "bottom-start" : "top-start"}
        data-pinned="true"
        style={{
          "position-anchor": anchorName,
          "width": "anchor-size(width)",
        } as JSX.CSSProperties}
        onMouseDown={(e) =>
          e.preventDefault()}
      >
        <Show when={open()}>
          <div
            class="bg-base-100 flex w-full flex-col overflow-hidden rounded border shadow-floating data-[side=bottom]:rounded-t-none data-[side=bottom]:border-t-0 data-[side=top]:rounded-b-none data-[side=top]:border-b-0"
            data-side={side()}
            style={{ "max-height": `${panelMaxHeight()}px` }}
          >
            <div class="flex-1 overflow-y-auto p-1">
              <For each={filteredOptions()}>
                {(opt) => {
                  let labelRef: HTMLSpanElement | undefined;
                  const isSelected = () => opt.value === p.value;
                  return (
                    <div
                      ref={(el) => {
                        if (isSelected() && !didScrollToSelected) {
                          didScrollToSelected = true;
                          queueMicrotask(() =>
                            el.scrollIntoView({ block: "nearest" })
                          );
                        }
                      }}
                      class="ui-hoverable-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                      onClick={() => selectValue(opt.value)}
                      onMouseEnter={(e) => {
                        if (
                          labelRef &&
                          labelRef.scrollWidth > labelRef.clientWidth
                        ) {
                          showTooltip({
                            anchor: e.currentTarget.getBoundingClientRect(),
                            content: getSearchText(opt),
                            position: "right",
                            size: "sm",
                          });
                        }
                      }}
                      onMouseLeave={hideTooltip}
                    >
                      <span class="relative h-4 w-4 flex-none">
                        <Show when={isSelected()}>
                          <CheckSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
                        </Show>
                      </span>
                      <span
                        ref={labelRef}
                        class="flex-1 select-none truncate data-[mono=true]:font-mono data-[mono=true]:text-xs"
                        classList={{ "font-700": isSelected() }}
                        data-mono={p.mono}
                      >
                        {opt.label}
                      </span>
                    </div>
                  );
                }}
              </For>
              <Show when={filteredOptions().length === 0}>
                <div class="text-base-content-muted px-2 py-1 text-sm">
                  {t3({
                    en: "No matching options",
                    fr: "Aucune option correspondante",
                    pt: "Sem opções correspondentes",
                  })}
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
