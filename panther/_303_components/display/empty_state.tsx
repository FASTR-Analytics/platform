// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import { Icon, type IconName } from "../icons/mod.ts";

type EmptyStateProps = {
  iconName?: IconName;
  title: string;
  description?: string;
  children?: JSX.Element;
};

export function EmptyState(p: EmptyStateProps) {
  return (
    <div class="ui-pad ui-spy-sm flex h-full flex-col items-center justify-center text-center">
      <Show when={p.iconName} keyed>
        {(iconName) => (
          <span class="text-base-content-muted text-3xl">
            <Icon iconName={iconName} />
          </span>
        )}
      </Show>
      <p class="ui-text-title">{p.title}</p>
      <Show when={p.description}>
        <p class="text-base-content-muted max-w-md text-sm">{p.description}</p>
      </Show>
      <Show when={p.children} keyed>
        {(keyedChildren) => <div>{keyedChildren}</div>}
      </Show>
    </div>
  );
}
