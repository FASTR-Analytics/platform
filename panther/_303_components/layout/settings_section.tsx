// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { JSX, Show } from "solid-js";

type Props = {
  header: string;
  children: JSX.Element;
  rightChildren?: JSX.Element;
};

export function SettingsSection(p: Props) {
  return (
    <div class="ui-pad border-base-300 flex rounded border">
      <div class="ui-spy-sm flex-1">
        <div class="ui-text-heading">{p.header}</div>
        {p.children}
      </div>
      <Show when={p.rightChildren} keyed>
        {(keyedRightChildren) => {
          return <div class="flex-none">{keyedRightChildren}</div>;
        }}
      </Show>
    </div>
  );
}
