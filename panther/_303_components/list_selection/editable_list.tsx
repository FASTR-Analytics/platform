// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import type { Intent } from "../types.ts";
import { Icon, type IconName } from "../icons/mod.ts";
import { Button } from "../form_inputs/button.tsx";
import { IconRenderer } from "../form_inputs/icon_renderer.tsx";
import type { ListItem } from "./list_item_types.ts";
import {
  createSelectionController,
  type SelectionMode,
} from "./create_selection_controller.ts";
import { Reorderable } from "./_internal/reorderable.tsx";

export type RowAction = {
  iconName: IconName;
  onClick: () => void;
  intent?: Intent;
  ariaLabel?: string;
  show?: boolean;
};

// A plain controlled component: data in (`items`), intentions out (callbacks).
// It contains NO controller in its contract; it builds one internally only to
// drive selection. v1 covers single-select + reorder-only (the in-scope
// consumers). Multi-select lists use `createSelectionController` + custom markup
// (the card-grid pattern). No inline editing (D-no-inline) — `onEdit(id)` opens
// the caller's editor. No `addMenu` / `isGroupHeader` (deferred — marker-only).
export type EditableListProps<T extends string, M = never> = {
  items: ListItem<T, M>[];

  // selection — omit all three for a non-selectable (e.g. reorder-only) list
  mode?: SelectionMode;
  selected?: T | T[];
  onSelectChange?: (ids: T[]) => void;

  // affordances — each present handler shows its affordance
  onAdd?: () => void;
  addLabel?: string;
  onEdit?: (id: T) => void;
  onDelete?: (ids: T[]) => void;
  onReorder?: (orderedIds: T[]) => void;

  // chrome
  title?: string | JSX.Element;
  showCount?: boolean;
  readOnly?: boolean;
  renderItem?: (item: ListItem<T, M>) => JSX.Element;
  rowActions?: (item: ListItem<T, M>) => RowAction[];
  emptyMessage?: string;
  fullWidth?: boolean;
};

function dotClass(intent: Intent): string {
  const base = "h-2 w-2 flex-none rounded-full";
  const map: Record<Intent, string> = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-neutral",
    "base-content": "bg-base-content",
    "base-100": "bg-base-100",
  };
  return `${base} ${map[intent]}`;
}

export function EditableList<T extends string, M = never>(
  p: EditableListProps<T, M>,
) {
  const selectable = () =>
    p.mode !== undefined ||
    p.selected !== undefined ||
    p.onSelectChange !== undefined;

  const controller = createSelectionController<T>({
    ids: () => p.items.map((i) => i.id),
    mode: p.mode ?? "single",
    selected: () => p.selected,
    onSelectionChange: (ids) => p.onSelectChange?.(ids),
  });

  const reorderable = () => !!p.onReorder && !p.readOnly;
  const showHeader = () => p.title !== undefined || (!!p.onAdd && !p.readOnly);

  function defaultContent(item: ListItem<T, M>): JSX.Element {
    return (
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <Show when={item.iconName}>
            <span class="h-4 w-4 flex-none">
              <IconRenderer iconName={item.iconName!} />
            </span>
          </Show>
          <span class="truncate">{item.label}</span>
          <Show when={item.badge !== undefined}>
            <span class="bg-base-300 text-base-content rounded-full px-2 py-0.5 text-xs">
              {item.badge}
            </span>
          </Show>
          <Show when={item.dot}>
            <span class={dotClass(item.dot!)} />
          </Show>
        </div>
        <Show when={item.sublabel}>
          <div class="ui-text-caption truncate">{item.sublabel}</div>
        </Show>
      </div>
    );
  }

  function row(item: ListItem<T, M>, withHandle: boolean): JSX.Element {
    return (
      <div
        class="flex items-center gap-1 rounded p-1 text-sm"
        classList={{
          "ui-quiet": true,
          "bg-base-200": selectable() && controller.isSelected(item.id),
        }}
      >
        <Show when={withHandle}>
          <div class="el-drag text-base-content-muted flex h-6 w-6 flex-none cursor-grab items-center justify-center active:cursor-grabbing">
            <Icon iconName="gripVertical" />
          </div>
        </Show>
        <div
          class="min-w-0 flex-1 px-2 py-1"
          classList={{ "cursor-pointer": selectable() }}
          onClick={(e) => {
            if (selectable()) controller.handleClick(item.id, e);
          }}
        >
          <Show when={p.renderItem} fallback={defaultContent(item)}>
            {p.renderItem!(item)}
          </Show>
        </div>
        <Show when={!p.readOnly}>
          <For each={p.rowActions?.(item) ?? []}>
            {(a) => (
              <Show when={a.show !== false}>
                <Button
                  size="sm"
                  intent={a.intent ?? "base-100"}
                  iconName={a.iconName}
                  aria-label={a.ariaLabel}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    a.onClick();
                  }}
                />
              </Show>
            )}
          </For>
          <Show when={p.onEdit}>
            <Button
              size="sm"
              intent="base-100"
              iconName="pencil"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                p.onEdit!(item.id);
              }}
            />
          </Show>
          <Show when={p.onDelete}>
            <Button
              size="sm"
              intent="base-100"
              iconName="trash"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                p.onDelete!([item.id]);
              }}
            />
          </Show>
        </Show>
      </div>
    );
  }

  return (
    <div class="ui-spy-sm data-[w=true]:w-full" data-w={p.fullWidth}>
      <Show when={showHeader()}>
        <div class="ui-gap-sm flex items-center pb-2">
          <div class="font-700 min-w-0 flex-1 truncate text-sm">
            <Show when={p.title}>
              {p.title}
              <Show when={p.showCount}>{` (${p.items.length})`}</Show>
            </Show>
          </div>
          <Show when={p.onAdd && !p.readOnly}>
            <Button
              onClick={p.onAdd}
              iconName="plus"
              intent="primary"
              size="sm"
            >
              {p.addLabel ?? t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
            </Button>
          </Show>
        </div>
      </Show>

      <Show
        when={p.items.length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {p.emptyMessage ??
              t3({
                en: "Nothing here yet",
                fr: "Rien pour le moment",
                pt: "Ainda não há nada aqui",
              })}
          </div>
        }
      >
        <Show
          when={reorderable()}
          fallback={
            <div class="ui-spy-sm">
              <For each={p.items}>{(item) => row(item, false)}</For>
            </div>
          }
        >
          <Reorderable
            items={p.items}
            onReorder={(ids) => p.onReorder!(ids as T[])}
            handle=".el-drag"
            class="ui-spy-sm"
          >
            {(item) => row(item, true)}
          </Reorderable>
        </Show>
      </Show>
    </div>
  );
}
