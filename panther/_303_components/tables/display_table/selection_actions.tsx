// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX } from "solid-js";
import { plural, type PluralForms, t3 } from "../../deps.ts";
import { Button } from "../../form_inputs/mod.ts";
import type { BulkAction } from "./types.ts";

// Worded so that only the noun inflects: nothing in it carries gender.
export function getSelectionSentence(
  n: number,
  itemLabel: PluralForms<string>,
): string {
  return `${t3({ en: "Selected:", fr: "Sélection :", pt: "Seleção:" })} ${n} ${
    plural(n, itemLabel)
  }`;
}

type SelectionActionsProps<T> = {
  items: T[];
  actions: BulkAction<T>[];
  itemLabel: PluralForms<string>;
  onClear: () => void;
};

// No border, background or padding of its own: the host (the table toolbar, a
// HeadingBar's right slot) supplies the row.
export function SelectionActions<T>(p: SelectionActionsProps<T>): JSX.Element {
  return (
    <div class="ui-gap flex w-full items-center">
      <span class="font-700 flex-none text-sm">
        {getSelectionSentence(p.items.length, p.itemLabel)}
      </span>
      <_BulkActionButtons
        items={p.items}
        actions={p.actions}
        onClear={p.onClear}
      />
    </div>
  );
}

type BulkActionButtonsProps<T> = {
  items: T[];
  actions: BulkAction<T>[];
  onClear: () => void;
};

export function _BulkActionButtons<T>(p: BulkActionButtonsProps<T>) {
  const run = async (action: BulkAction<T>) => {
    const result = await action.onClick(p.items);
    if (result === true || result === "CLEAR_SELECTION") {
      p.onClear();
    }
  };

  return (
    <div class="ml-auto ui-gap-sm flex items-center">
      <For each={p.actions}>
        {(action) => (
          <Button
            onClick={() => run(action)}
            intent={action.intent || "neutral"}
            outline={action.outline}
            state={action.state?.()}
          >
            {action.label}
          </Button>
        )}
      </For>
      <Button onClick={p.onClear} intent="neutral" outline>
        {t3({
          en: "Clear selection",
          fr: "Effacer la sélection",
          pt: "Limpar seleção",
        })}
      </Button>
    </div>
  );
}
