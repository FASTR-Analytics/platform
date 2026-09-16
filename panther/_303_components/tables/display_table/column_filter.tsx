// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  onCleanup,
  Show,
} from "solid-js";
import { t3 } from "../../deps.ts";
import { Input } from "../../form_inputs/mod.ts";
import { CheckMark } from "../../form_inputs/_internal/check_glyphs.tsx";
import { distinctFilterValues } from "./helpers.ts";
import { HeaderGlyph } from "./header_glyph.tsx";
import type { AnyRow, TableColumn } from "./types.ts";

const SEARCH_THRESHOLD = 8;

type ColumnFilterProps<T extends AnyRow> = {
  column: TableColumn<T>;
  data: T[];
  excluded: ReadonlySet<string>;
  onChange: (excluded: ReadonlySet<string>) => void;
  scrollContainer: Accessor<HTMLElement | undefined>;
  class: string;
};

export function ColumnFilter<T extends AnyRow>(p: ColumnFilterProps<T>) {
  const id = createUniqueId();
  const popoverId = `table-filter-${id}`;
  const anchorName = `--table-filter-anchor-${id}`;
  let triggerRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;

  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const active = () => p.excluded.size > 0;

  const options = createMemo(() =>
    open() ? distinctFilterValues(p.data, p.column) : []
  );

  const shown = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return options();
    return options().filter((v) => optionLabel(v).toLowerCase().includes(q));
  });

  const checkedCount = () => options().filter((v) => !p.excluded.has(v)).length;
  const allShownChecked = () =>
    shown().length > 0 && shown().every((v) => !p.excluded.has(v));
  const someShownChecked = () => shown().some((v) => !p.excluded.has(v));

  function toggleValue(value: string) {
    const next = new Set(p.excluded);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    p.onChange(next);
  }

  function toggleAllShown() {
    if (shown().length === 0) return;
    const next = new Set(p.excluded);
    const uncheck = allShownChecked();
    for (const v of shown()) {
      if (uncheck) {
        next.add(v);
      } else {
        next.delete(v);
      }
    }
    p.onChange(next);
  }

  function hide() {
    if (popoverRef?.matches(":popover-open")) {
      popoverRef.hidePopover();
    }
  }

  // An anchored panel whose trigger is clipped by the scroll container would
  // float beside nothing. Watching the trigger's visibility, not scroll
  // events, keeps the panel open when filtering shortens a scrolled table and
  // the browser clamps scrollTop, and when a sticky header scrolls with it.
  createEffect(() => {
    const root = p.scrollContainer();
    if (!root || !triggerRef) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 1) hide();
      },
      { root, threshold: 1 },
    );
    observer.observe(triggerRef);
    onCleanup(() => observer.disconnect());
  });

  // Panther's modals are not native <dialog>s: AlertProvider closes on a
  // document-level Escape listener, which the popover's own close watcher
  // does not stop. Focus moves into the panel on open, and native on:keydown
  // listeners on the panel and on the trigger (focus can Tab back to it while
  // the panel stays open) stop Escape before it reaches the document. Solid's
  // onKeyDown cannot do this: keydown is delegated, so that handler already
  // runs at the document, beside AlertProvider's listener. preventScroll keeps
  // the focus call from scrolling the table.
  function handleToggle(e: ToggleEvent) {
    const isOpen = e.newState === "open";
    if (isOpen) setQuery("");
    setOpen(isOpen);
    if (isOpen) {
      const target = popoverRef?.querySelector("input") ?? popoverRef;
      target?.focus({ preventScroll: true });
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    hide();
    triggerRef?.focus({ preventScroll: true });
  }

  function handleTriggerKeyDown(e: KeyboardEvent) {
    if (open()) handleKeyDown(e);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popovertarget={popoverId}
        aria-label={t3({
          en: `Filter ${p.column.header}`,
          fr: `Filtrer ${p.column.header}`,
          pt: `Filtrar ${p.column.header}`,
        })}
        aria-expanded={open()}
        class={p.class}
        on:keydown={handleTriggerKeyDown}
        style={{ "anchor-name": anchorName } as JSX.CSSProperties}
      >
        <HeaderGlyph
          muted={!active()}
          iconName={active() ? "filterFilled" : "filter"}
        />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover
        tabindex="-1"
        class="ui-popover outline-none"
        data-position="bottom-start"
        style={{ "position-anchor": anchorName } as JSX.CSSProperties}
        on:toggle={handleToggle}
        on:keydown={handleKeyDown}
      >
        <Show when={open()}>
          <div class="bg-base-100 text-base-content font-400 flex max-h-[320px] min-w-[200px] max-w-[320px] flex-col overflow-hidden rounded border text-left text-sm normal-case tracking-normal shadow-floating">
            <Show when={options().length > SEARCH_THRESHOLD}>
              <div class="flex-none border-b p-1.5">
                <Input
                  value={query()}
                  onChange={setQuery}
                  size="sm"
                  searchIcon
                  fullWidth
                />
              </div>
            </Show>
            <div
              class="ui-hoverable-base-100 flex flex-none cursor-pointer items-center gap-2 border-b px-3 py-1.5"
              onClick={toggleAllShown}
            >
              <CheckMark
                checked={allShownChecked()}
                indeterminate={!allShownChecked() && someShownChecked()}
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
                {checkedCount()}/{options().length}
              </span>
            </div>
            <div
              role="listbox"
              aria-multiselectable="true"
              class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
            >
              <For each={shown()}>
                {(value) => (
                  <div
                    role="option"
                    aria-selected={!p.excluded.has(value)}
                    class="ui-hoverable-base-100 flex cursor-pointer items-center gap-2 rounded px-2 py-1"
                    onClick={() => toggleValue(value)}
                  >
                    <CheckMark checked={!p.excluded.has(value)} />
                    <span
                      class="flex-1 select-none truncate"
                      classList={{ "text-base-content-muted": value === "" }}
                    >
                      {optionLabel(value)}
                    </span>
                  </div>
                )}
              </For>
              <Show when={shown().length === 0}>
                <div class="text-base-content-muted px-2 py-1">
                  {t3({
                    en: "No matching options",
                    fr: "Aucune option correspondante",
                    pt: "Sem opções correspondentes",
                  })}
                </div>
              </Show>
            </div>
            <Show when={active()}>
              <div
                class="ui-hoverable-base-100 flex-none cursor-pointer border-t px-3 py-1.5"
                onClick={() => p.onChange(new Set())}
              >
                {t3({
                  en: "Clear filter",
                  fr: "Effacer le filtre",
                  pt: "Limpar filtro",
                })}
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
}

function optionLabel(value: string): string {
  return value === ""
    ? t3({ en: "(empty)", fr: "(vide)", pt: "(vazio)" })
    : value;
}
