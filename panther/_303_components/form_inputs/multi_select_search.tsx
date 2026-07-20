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
import type { Intent } from "../types.ts";
import { Icon } from "../icons/mod.ts";
import type { PopoverPosition } from "../special_state/popover_menu.tsx";
import type { SelectOption } from "./types.ts";
import { Checkbox } from "./checkbox.tsx";
import { Input } from "./input.tsx";
import { getSelectClasses } from "./_internal/input_classes.ts";

type MultiSelectSearchProps<T extends string> = {
  values: T[];
  options: SelectOption<T>[];
  onChange: (v: T[]) => void;
  label?: string | JSX.Element;
  placeholder?: string;
  position?: PopoverPosition;
  intentWhenChecked?: Intent;
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

export function MultiSelectSearch<T extends string>(
  p: MultiSelectSearchProps<T>,
) {
  const id = createUniqueId();
  const popoverId = `multi-select-search-${id}`;
  const anchorName = `--multi-select-search-anchor-${id}`;

  const [open, setOpen] = createSignal<boolean>(false);
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

  function handleToggle(e: Event) {
    const opening =
      (e as Event & { newState: "open" | "closed" }).newState === "open";
    batch(() => {
      if (opening) {
        setQuery("");
        setPinned(new Set<string>(p.values));
      }
      setOpen(opening);
    });
  }

  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show when={p.label}>
        <label class="ui-label">{p.label}</label>
      </Show>
      <div class="ui-form-text relative w-full">
        <button
          type="button"
          popovertarget={popoverId}
          class={`${getSelectClasses(p.size, false, undefined)} text-left`}
          data-mono={p.mono}
          data-placeholder={!summary()}
          disabled={p.disabled}
          style={{ "anchor-name": anchorName } as JSX.CSSProperties}
        >
          {summary() ??
            p.placeholder ??
            t3({
              en: "Select...",
              fr: "Sélectionner...",
              pt: "Selecionar...",
            })}
        </button>
        <div class="text-base-content pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center">
          <Icon iconName="selector" />
        </div>
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
      <div
        id={popoverId}
        popover
        class="ui-popover"
        data-position={p.position ?? "bottom-start"}
        style={{
          "position-anchor": anchorName,
          "min-width": "anchor-size(width)",
        } as JSX.CSSProperties}
        on:toggle={handleToggle}
      >
        <Show when={open()}>
          <div class="bg-base-100 flex max-h-[min(400px,70vh)] min-w-full max-w-[min(90vw,400px)] flex-col overflow-hidden rounded border shadow-floating">
            <div class="flex-none border-b p-2">
              <Input
                value={query()}
                onChange={setQuery}
                placeholder={t3({
                  en: "Search...",
                  fr: "Rechercher...",
                  pt: "Pesquisar...",
                })}
                size="sm"
                fullWidth
                autoFocus
                mono={p.mono}
              />
            </div>
            <div class="flex flex-none items-center justify-between gap-2 border-b p-2">
              <Checkbox
                label={query().trim().length > 0
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
                checked={allFilteredSelected()}
                indeterminate={!allFilteredSelected() && someFilteredSelected()}
                onChange={toggleSelectAllFiltered}
                intentWhenChecked={p.intentWhenChecked}
              />
              <div class="text-base-content-muted flex-none text-xs">
                {selectedOptions().length}/{p.options.length}
              </div>
            </div>
            <div class="flex-1 space-y-1 overflow-y-auto p-2">
              <For each={filteredOptions()}>
                {(opt) => {
                  return (
                    <Checkbox
                      label={p.mono && typeof opt.label === "string"
                        ? <span class="font-mono text-xs">{opt.label}</span>
                        : opt.label}
                      checked={selectedSet().has(opt.value)}
                      onChange={() => toggleValue(opt.value)}
                      intentWhenChecked={p.intentWhenChecked}
                    />
                  );
                }}
              </For>
              <Show when={filteredOptions().length === 0}>
                <div class="text-base-content-muted text-sm">
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
