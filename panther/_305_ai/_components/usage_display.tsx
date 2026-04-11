// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import { Show } from "solid-js";
import { t3 } from "../deps.ts";
import {
  calculateCost,
  formatCost,
  formatTokenCount,
} from "../_core/cost_utils.ts";
import type { AnthropicModel, Usage } from "../deps.ts";

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
                {formatTokenCount(usage().input_tokens)}{" "}
                {t3({ en: "in", fr: "entrée" })} /{" "}
                {formatTokenCount(usage().output_tokens)}{" "}
                {t3({ en: "out", fr: "sortie" })}
              </span>
              <Show when={cost}>
                <span>• {formatCost(cost!.totalCost)}</span>
              </Show>
            </div>
          );
        }

        return (
          <div class="ui-pad bg-base-200 rounded text-xs font-mono">
            <div class="mb-1 font-bold">
              {t3({ en: "Usage", fr: "Utilisation" })}
            </div>
            <div class="ui-gap-sm flex flex-wrap">
              <div>
                <span class="text-neutral">
                  {t3({ en: "Input:", fr: "Entrée :" })}
                </span>{" "}
                {formatTokenCount(usage().input_tokens)}
              </div>
              <div>
                <span class="text-neutral">
                  {t3({ en: "Output:", fr: "Sortie :" })}
                </span>{" "}
                {formatTokenCount(usage().output_tokens)}
              </div>
              <Show when={usage().cache_creation_input_tokens}>
                <div>
                  <span class="text-neutral">
                    {t3({ en: "Cache write:", fr: "Écriture cache :" })}
                  </span>{" "}
                  {formatTokenCount(usage().cache_creation_input_tokens!)}
                </div>
              </Show>
              <Show when={usage().cache_read_input_tokens}>
                <div>
                  <span class="text-neutral">
                    {t3({ en: "Cache read:", fr: "Lecture cache :" })}
                  </span>{" "}
                  {formatTokenCount(usage().cache_read_input_tokens!)}
                </div>
              </Show>
            </div>
            <Show when={cost}>
              <div class="text-primary mt-2 font-bold">
                {t3({ en: "Cost:", fr: "Coût :" })}{" "}
                {formatCost(cost!.totalCost)}
              </div>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
