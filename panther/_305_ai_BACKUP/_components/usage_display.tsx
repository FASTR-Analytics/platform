// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import { Show } from "solid-js";
import {
  calculateCost,
  formatCost,
  formatTokenCount,
} from "../_core/cost_utils.ts";
import type { AnthropicModel, Usage } from "../_core/types.ts";

type Props = {
  usage: Usage | null;
  model: AnthropicModel;
  showCost?: boolean;
  compact?: boolean;
};

export const UsageDisplay: Component<Props> = (props) => {
  return (
    <Show when={props.usage}>
      {(usage) => {
        const cost = props.showCost
          ? calculateCost(usage(), props.model)
          : null;

        if (props.compact) {
          return (
            <div class="text-neutral flex items-center gap-2 text-xs font-mono">
              <span>
                {formatTokenCount(usage().input_tokens)} in /{" "}
                {formatTokenCount(usage().output_tokens)} out
              </span>
              <Show when={cost}>
                <span>• {formatCost(cost!.totalCost)}</span>
              </Show>
            </div>
          );
        }

        return (
          <div class="ui-pad bg-base-200 rounded text-xs font-mono">
            <div class="mb-1 font-bold">Usage</div>
            <div class="ui-gap-sm flex flex-wrap">
              <div>
                <span class="text-neutral">Input:</span>{" "}
                {formatTokenCount(usage().input_tokens)}
              </div>
              <div>
                <span class="text-neutral">Output:</span>{" "}
                {formatTokenCount(usage().output_tokens)}
              </div>
              <Show when={usage().cache_creation_input_tokens}>
                <div>
                  <span class="text-neutral">Cache write:</span>{" "}
                  {formatTokenCount(usage().cache_creation_input_tokens!)}
                </div>
              </Show>
              <Show when={usage().cache_read_input_tokens}>
                <div>
                  <span class="text-neutral">Cache read:</span>{" "}
                  {formatTokenCount(usage().cache_read_input_tokens!)}
                </div>
              </Show>
            </div>
            <Show when={cost}>
              <div class="text-primary mt-2 font-bold">
                Cost: {formatCost(cost!.totalCost)}
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
