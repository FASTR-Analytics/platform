// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Show } from "solid-js";
import { to100Pct0 } from "../deps.ts";
import type { StateHolderFormAction } from "../special_state/mod.ts";

type Props = {
  progressFrom0To100: number;
  small?: boolean;
  progressMsg?: string;
  onlyShowWhenLoadingState?: StateHolderFormAction;
};

export function ProgressBar(p: Props) {
  return (
    <Show
      when={p.onlyShowWhenLoadingState === undefined ||
        p.onlyShowWhenLoadingState.status === "loading"}
    >
      <div class="ui-spy-sm">
        <div
          class="bg-base-300 flex h-12 w-full overflow-clip rounded data-[small=true]:h-6"
          data-small={p.small}
        >
          <div
            class="bg-primary h-12"
            style={{ width: to100Pct0(p.progressFrom0To100) }}
          />
        </div>
        <Show when={p.progressMsg !== undefined}>
          <div class="text-xs">{p.progressMsg}</div>
        </Show>
      </div>
    </Show>
  );
}

export function getProgress() {
  const [progress, setProgress] = createSignal<number>(0);
  const [progressMsg, setProgressMsg] = createSignal<string>("");

  const onProgress = (p: number, m: string) => {
    setProgress(p);
    setProgressMsg(m);
  };

  const progressFrom0To100 = () => progress() * 100;

  return { progressFrom0To100, progressMsg, onProgress };
}
