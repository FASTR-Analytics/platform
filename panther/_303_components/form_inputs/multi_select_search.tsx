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
import type { SelectOption } from "./types.ts";
import { getSelectClasses } from "./_internal/input_classes.ts";

type MultiSelectSearchProps<T extends string> = {
  values: T[];
  options: SelectOption<T>[];
  onChange: (v: T[]) => void;
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

function CheckMark(p: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span class="bg-base-100 relative h-4 w-4 flex-none rounded border">
      <Show when={p.indeterminate}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="text-base-content absolute inset-0 m-auto h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12h14" />
        </svg>
      </Show>
      <Show when={p.checked && !p.indeterminate}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="text-base-content absolute inset-0 m-auto h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12l5 5l10 -10" />
        </svg>
      </Show>
    </span>
  );
}

// Combo-box multi-select: the closed control is a select-styled input showing
// a summary of the selection; focusing it turns it into the search input in
// place (so the cursor never moves) and opens an anchored popover holding only
// the select-all row and the option list. The panel is a manual popover:
// open/close is driven by focus/blur/Escape on the input, and mousedown inside
// the panel is prevented so row clicks never steal focus from the input.
// The panel matches the trigger width and its side (below/above) and max
// height are measured once at open and pinned (data-pinned disables the CSS
// position-try fallbacks), so the meeting corners can be squared off into one
// seamless unit and nothing flips or jumps while the user types.
export function MultiSelectSearch<T extends string>(
  p: MultiSelectSearchProps<T>,
) {
  const id = createUniqueId();
  const popoverId = `multi-select-search-${id}`;
  const anchorName = `--multi-select-search-anchor-${id}`;
  let inputRef: HTMLInputElement | undefined;
  let panelRef: HTMLDivElement | undefined;
  let wrapperRef: HTMLDivElement | undefined;

  const [open, setOpen] = createSignal<boolean>(false);
  const [side, setSide] = createSignal<"bottom" | "top">("bottom");
  const [panelMaxHeight, setPanelMaxHeight] = createSignal<number>(400);
  const [query, setQuery] = createSignal<string>("");
  // Snapshot of the selection at open time, used only for ordering (selected
  // pinned first) so rows don't jump around while the user toggles.
  const [pinned, setPinned] = createSignal<ReadonlySet<string>>(new Set());

  const selectedSet = createMemo(() => new Set<string>(p.values));

  const selectedOptions = createMemo(() =>
    p.options.filter((opt) => selectedSet().has(opt.value))
  );

  const orderedOptions = createMemo(() => {
    const pin = pinned();
    const pinnedOpts = p.options.filter((opt) => pin.has(opt.value));
    const rest = p.options.filter((opt) => !pin.has(opt.value));
    return [...pinnedOpts, ...rest];
  });

  const filteredOptions = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) {
      return orderedOptions();
    }
    return orderedOptions().filter((opt) =>
      getSearchText(opt).toLowerCase().includes(q)
    );
  });

  const allFilteredSelected = createMemo(() => {
    const opts = filteredOptions();
    return opts.length > 0 && opts.every((opt) => selectedSet().has(opt.value));
  });

  const someFilteredSelected = createMemo(() =>
    filteredOptions().some((opt) => selectedSet().has(opt.value))
  );

  const summary = createMemo(() => {
    const sel = selectedOptions();
    if (sel.length === 0) {
      return undefined;
    }
    const names = sel.slice(0, 2).map(getSearchText);
    if (sel.length <= 2) {
      return names.join(", ");
    }
    return `${names.join(", ")} +${sel.length - 2}`;
  });

  function toggleValue(value: T) {
    if (p.values.includes(value)) {
      p.onChange(p.values.filter((v) => v !== value));
    } else {
      p.onChange([...p.values, value]);
    }
  }

  function toggleSelectAllFiltered() {
    const filteredValues = filteredOptions().map((opt) => opt.value);
    if (allFilteredSelected()) {
      const remove = new Set<string>(filteredValues);
      p.onChange(p.values.filter((v) => !remove.has(v)));
    } else {
      const existing = selectedSet();
      p.onChange([
        ...p.values,
        ...filteredValues.filter((v) => !existing.has(v)),
      ]);
    }
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
    batch(() => {
      setSide(chosenSide);
      setPanelMaxHeight(maxHeight);
      setQuery("");
      setPinned(new Set<string>(p.values));
      setOpen(true);
    });
    panelRef?.showPopover();
  }

  function closePanel() {
    if (!open()) {
      return;
    }
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
          } text-left data-[open=true]:cursor-text data-[panel-side=bottom]:rounded-b-none data-[panel-side=top]:rounded-t-none`}
          data-mono={p.mono}
          data-open={open()}
          data-panel-side={open() ? side() : undefined}
          readonly={!open()}
          disabled={p.disabled}
          title={!open() && selectedOptions().length > 0
            ? selectedOptions().map(getSearchText).join(", ")
            : undefined}
          value={open() ? query() : summary() ?? ""}
          placeholder={open()
            ? summary() ??
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
        id={popoverId}
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
            <div
              class="ui-hoverable-base-100 flex flex-none cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm"
              onClick={toggleSelectAllFiltered}
            >
              <CheckMark
                checked={allFilteredSelected()}
                indeterminate={!allFilteredSelected() &&
                  someFilteredSelected()}
              />
              <span class="flex-1 select-none truncate">
                {query().trim().length > 0
                  ? t3({
                    en: "Select all matching",
                    fr: "Sélectionner toutes les correspondances",
                    pt: "Selecionar todas as correspondências",
                  })
                  : t3({
                    en: "Select all",
                    fr: "Tout sélectionner",
                    pt: "Selecionar tudo",
                  })}
              </span>
              <span class="text-base-content-muted flex-none select-none text-xs">
                {selectedOptions().length}/{p.options.length}
              </span>
            </div>
            <div class="flex-1 overflow-y-auto p-1">
              <For each={filteredOptions()}>
                {(opt) => {
                  return (
                    <div
                      class="ui-hoverable-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                      onClick={() => toggleValue(opt.value)}
                    >
                      <CheckMark checked={selectedSet().has(opt.value)} />
                      <span
                        class="flex-1 select-none truncate data-[mono=true]:font-mono data-[mono=true]:text-xs"
                        data-mono={p.mono}
                        onMouseEnter={(e) => {
                          if (
                            e.currentTarget.scrollWidth >
                              e.currentTarget.clientWidth
                          ) {
                            e.currentTarget.title = getSearchText(opt);
                          }
                        }}
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
