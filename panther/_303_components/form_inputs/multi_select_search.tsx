// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import { hideTooltip, showTooltip } from "../special_state/tooltip.tsx";
import type { SelectOption } from "./types.ts";
import { CheckSvg, IndeterminateSvg } from "./_internal/check_glyphs.tsx";
import {
  ComboBoxFrame,
  createComboBoxPanel,
  getSearchText,
} from "./_internal/combo_box.tsx";

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

// Presentational check square for the option rows, built from Checkbox's
// glyph internals but deliberately smaller — it reads as part of the larger
// control, not a standalone form checkbox. Not the interactive Checkbox
// component: the row is the click target here, and nesting a labeled input
// inside a clickable row would double-fire and fight the panel's focus
// handling.
function CheckMark(p: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span class="bg-base-100 relative h-4 w-4 flex-none rounded border">
      <Show when={p.indeterminate}>
        <IndeterminateSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
      </Show>
      <Show when={p.checked && !p.indeterminate}>
        <CheckSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
      </Show>
    </span>
  );
}

// Combo-box multi-select: shares the panel mechanism and chrome with
// SelectSearch via ComboBoxFrame. What is specific to the multi case lives
// here: the selection summary shown when closed, the select-all row, the
// open-time pin that keeps selected options at the top, and rows that toggle
// without closing.
export function MultiSelectSearch<T extends string>(
  p: MultiSelectSearchProps<T>,
) {
  // Snapshot of the selection at open time, used only for ordering (selected
  // pinned first) so rows don't jump around while the user toggles.
  const [pinned, setPinned] = createSignal<ReadonlySet<string>>(new Set());
  const panel = createComboBoxPanel({
    onOpen: () => setPinned(new Set<string>(p.values)),
  });

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
    const q = panel.query().trim().toLowerCase();
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
    return `${names.join(", ")}, +${sel.length - 2}`;
  });

  // The overlay splits the summary so the +N count sits in a non-shrinking
  // span that survives truncation of the names.
  const summaryParts = createMemo(() => {
    const sel = selectedOptions();
    if (sel.length === 0) {
      return undefined;
    }
    return {
      names: sel.slice(0, 2).map(getSearchText).join(", "),
      more: sel.length > 2 ? sel.length - 2 : undefined,
    };
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

  return (
    <ComboBoxFrame
      panel={panel}
      displayText={summary()}
      overlay={
        <Show when={summaryParts()} keyed>
          {(parts) => (
            <>
              <span class="min-w-0 truncate">{parts.names}</span>
              <Show when={parts.more} keyed>
                {(more) => <span class="flex-none">, +{more}</span>}
              </Show>
            </>
          )}
        </Show>
      }
      label={p.label}
      placeholder={p.placeholder}
      fullWidth={p.fullWidth}
      size={p.size}
      mono={p.mono}
      disabled={p.disabled}
      invalidMsg={p.invalidMsg}
      onTriggerMouseEnter={(e) => {
        if (selectedOptions().length > 0) {
          showTooltip({
            anchor: e.currentTarget.getBoundingClientRect(),
            content: selectedOptions().map(getSearchText).join(", "),
            position: "right",
            size: "sm",
          });
        }
      }}
    >
      <div
        class="ui-hoverable-base-100 flex flex-none cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm"
        onClick={toggleSelectAllFiltered}
      >
        <CheckMark
          checked={allFilteredSelected()}
          indeterminate={!allFilteredSelected() && someFilteredSelected()}
        />
        <span class="flex-1 select-none truncate">
          {panel.query().trim().length > 0
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
      <div
        role="listbox"
        aria-multiselectable="true"
        class="flex-1 overflow-y-auto overscroll-contain p-1"
      >
        <For each={filteredOptions()}>
          {(opt) => {
            let labelRef: HTMLSpanElement | undefined;
            return (
              <div
                role="option"
                aria-selected={selectedSet().has(opt.value)}
                class="ui-hoverable-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                onClick={() => toggleValue(opt.value)}
                onMouseEnter={(e) => {
                  if (labelRef && labelRef.scrollWidth > labelRef.clientWidth) {
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
                <CheckMark checked={selectedSet().has(opt.value)} />
                <span
                  ref={labelRef}
                  class="flex-1 select-none truncate data-[mono=true]:font-mono data-[mono=true]:text-xs"
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
    </ComboBoxFrame>
  );
}
