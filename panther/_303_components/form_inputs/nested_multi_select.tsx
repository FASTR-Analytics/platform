// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createMemo,
  createSignal,
  For,
  JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { t3 } from "../deps.ts";
import { Checkbox } from "./checkbox.tsx";
import { ChevronDownIcon, ChevronRightIcon } from "../icons/mod.ts";
import type { Intent } from "../types.ts";
import type {
  NestedSelectBranchNode,
  NestedSelectLeafNode,
  NestedSelectNode,
} from "./types.ts";

type NestedMultiSelectProps<T extends string> = {
  values: T[];
  nodes: NestedSelectNode<T>[];
  onChange: (v: T[]) => void;
  label?: string | JSX.Element;
  showSelectAll?: boolean;
  onlyShowSelectAllWhenAtLeast?: number;
  intentWhenChecked?: Intent;
  defaultOpen?: boolean;
};

function getAllLeafValues<T extends string>(
  nodes: NestedSelectNode<T>[],
): T[] {
  return nodes.flatMap((n) =>
    "children" in n ? getAllLeafValues(n.children) : [n.value]
  );
}

function asBranch<T extends string>(
  n: NestedSelectNode<T>,
): NestedSelectBranchNode<T> | undefined {
  return "children" in n ? n : undefined;
}

function asLeaf<T extends string>(
  n: NestedSelectNode<T>,
): NestedSelectLeafNode<T> | undefined {
  return "value" in n ? n : undefined;
}

export function NestedMultiSelect<T extends string>(
  p: NestedMultiSelectProps<T>,
) {
  const allLeafValues = createMemo(() => getAllLeafValues(p.nodes));
  const valuesSet = createMemo(() => new Set(p.values));

  const [toggledKeys, setToggledKeys] = createSignal<Set<string>>(new Set());

  function isOpen(key: string): boolean {
    return p.defaultOpen ? !toggledKeys().has(key) : toggledKeys().has(key);
  }

  function toggleExpand(key: string) {
    const current = toggledKeys();
    const next = new Set(current);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setToggledKeys(next);
  }

  function toggleLeaf(value: T) {
    const validValues = p.values.filter((v) => allLeafValues().includes(v));
    if (valuesSet().has(value)) {
      p.onChange(validValues.filter((v) => v !== value));
    } else {
      p.onChange([...validValues, value]);
    }
  }

  function toggleBranch(branchChildren: NestedSelectNode<T>[]) {
    const descendantLeaves = getAllLeafValues(branchChildren);
    const validValues = p.values.filter((v) => allLeafValues().includes(v));
    const vs = valuesSet();
    const allSelected = descendantLeaves.length > 0 &&
      descendantLeaves.every((v) => vs.has(v));
    if (allSelected) {
      const removeSet = new Set(descendantLeaves);
      p.onChange(validValues.filter((v) => !removeSet.has(v)));
    } else {
      const merged = new Set(validValues);
      for (const v of descendantLeaves) {
        merged.add(v);
      }
      p.onChange([...merged]);
    }
  }

  function toggleSelectAll() {
    const vs = valuesSet();
    const all = allLeafValues();
    const allSelected = all.length > 0 && all.every((v) => vs.has(v));
    if (allSelected) {
      p.onChange([]);
    } else {
      p.onChange([...all]);
    }
  }

  function NodeList(props: {
    nodes: NestedSelectNode<T>[];
    depth: number;
  }): JSX.Element {
    return (
      <For each={props.nodes}>
        {(node) => <NodeRow node={node} depth={props.depth} />}
      </For>
    );
  }

  function NodeRow(props: {
    node: NestedSelectNode<T>;
    depth: number;
  }): JSX.Element {
    return (
      <Switch>
        <Match when={asBranch(props.node)} keyed>
          {(bn) => {
            const descendantLeaves = createMemo(() =>
              getAllLeafValues(bn.children)
            );
            const selectedCount = createMemo(() =>
              descendantLeaves().filter((v) => valuesSet().has(v)).length
            );
            const allSelected = createMemo(() =>
              descendantLeaves().length > 0 &&
              selectedCount() === descendantLeaves().length
            );
            const someSelected = createMemo(() =>
              selectedCount() > 0 && !allSelected()
            );

            return (
              <>
                <div
                  class="flex items-center gap-1"
                  style={{ "padding-left": `${props.depth * 1.25}rem` }}
                >
                  <Show
                    when={bn.children.length > 0}
                    fallback={<div class="h-5 w-5 flex-none" />}
                  >
                    <button
                      type="button"
                      class="flex h-5 w-5 flex-none items-center justify-center"
                      onClick={() => toggleExpand(bn.key)}
                      aria-expanded={isOpen(bn.key)}
                      aria-label={isOpen(bn.key) ? "Collapse" : "Expand"}
                    >
                      <Show
                        when={isOpen(bn.key)}
                        fallback={<ChevronRightIcon />}
                        keyed
                      >
                        <ChevronDownIcon />
                      </Show>
                    </button>
                  </Show>
                  <Checkbox
                    checked={allSelected()}
                    indeterminate={someSelected()}
                    label={bn.label}
                    onChange={() => toggleBranch(bn.children)}
                    intentWhenChecked={p.intentWhenChecked}
                  />
                </div>
                <Show when={isOpen(bn.key) && bn.children.length > 0}>
                  <NodeList nodes={bn.children} depth={props.depth + 1} />
                </Show>
              </>
            );
          }}
        </Match>
        <Match when={asLeaf(props.node)} keyed>
          {(ln) => (
            <div
              class="flex items-center gap-1"
              style={{ "padding-left": `${props.depth * 1.25}rem` }}
            >
              <div class="h-5 w-5 flex-none" />
              <Checkbox
                checked={valuesSet().has(ln.value)}
                label={ln.label}
                onChange={() => toggleLeaf(ln.value)}
                intentWhenChecked={p.intentWhenChecked}
              />
            </div>
          )}
        </Match>
      </Switch>
    );
  }

  return (
    <div class="">
      <Show when={p.label}>
        <legend class="ui-label">{p.label}</legend>
      </Show>
      <div class="space-y-1">
        <Show
          when={p.showSelectAll &&
            allLeafValues().length >=
              (p.onlyShowSelectAllWhenAtLeast ?? 0)}
        >
          {(_) => {
            const vs = valuesSet;
            const all = allLeafValues;
            const allSelected = createMemo(() =>
              all().length > 0 && all().every((v) => vs().has(v))
            );
            const someSelected = createMemo(() => {
              const count = all().filter((v) => vs().has(v)).length;
              return count > 0 && !allSelected();
            });
            return (
              <>
                <Checkbox
                  label={t3({ en: "Select All", fr: "Tout sélectionner" })}
                  checked={allSelected()}
                  indeterminate={someSelected()}
                  onChange={toggleSelectAll}
                  intentWhenChecked={p.intentWhenChecked}
                />
                <div class="border-base-300 my-1 border-b" />
              </>
            );
          }}
        </Show>
        <NodeList nodes={p.nodes} depth={0} />
      </div>
    </div>
  );
}
