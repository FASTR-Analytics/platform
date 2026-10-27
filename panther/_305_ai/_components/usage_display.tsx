// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Match, Show, Switch } from "solid-js";
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

export function UsageDisplay(p: Props) {
  return (
    <Show when={p.usage}>
      {(usage) => {
        const cost =
          () => (p.showCost ? calculateCost(usage(), p.model) : null);

        return (
          <Switch>
            <Match when={p.compact}>
              <div class="text-base-content-muted flex items-center gap-2 text-xs font-mono">
                <span>
                  {formatTokenCount(usage().input_tokens)}{" "}
                  {t3({ en: "in", fr: "entrée", pt: "entrada", th: "เข้า" })} /
                  {" "}
                  {formatTokenCount(usage().output_tokens)}{" "}
                  {t3({ en: "out", fr: "sortie", pt: "saída", th: "ออก" })}
                </span>
                <Show when={cost()}>
                  <span>• {formatCost(cost()!.totalCost)}</span>
                </Show>
              </div>
            </Match>
            <Match when={!p.compact}>
              <div class="ui-pad bg-base-200 rounded text-xs font-mono">
                <div class="mb-1 font-700">
                  {t3({
                    en: "Usage",
                    fr: "Utilisation",
                    pt: "Utilização",
                    th: "การใช้งาน",
                  })}
                </div>
                <div class="ui-gap-sm flex flex-wrap">
                  <div>
                    <span class="text-base-content-muted">
                      {t3({
                        en: "Input:",
                        fr: "Entrée :",
                        pt: "Entrada:",
                        th: "อินพุต:",
                      })}
                    </span>{" "}
                    {formatTokenCount(usage().input_tokens)}
                  </div>
                  <div>
                    <span class="text-base-content-muted">
                      {t3({
                        en: "Output:",
                        fr: "Sortie :",
                        pt: "Saída:",
                        th: "เอาต์พุต:",
                      })}
                    </span>{" "}
                    {formatTokenCount(usage().output_tokens)}
                  </div>
                  <Show when={usage().cache_creation_input_tokens}>
                    <div>
                      <span class="text-base-content-muted">
                        {t3({
                          en: "Cache write:",
                          fr: "Écriture cache :",
                          pt: "Escrita de cache:",
                          th: "เขียนแคช:",
                        })}
                      </span>{" "}
                      {formatTokenCount(usage().cache_creation_input_tokens!)}
                    </div>
                  </Show>
                  <Show when={usage().cache_read_input_tokens}>
                    <div>
                      <span class="text-base-content-muted">
                        {t3({
                          en: "Cache read:",
                          fr: "Lecture cache :",
                          pt: "Leitura de cache:",
                          th: "อ่านแคช:",
                        })}
                      </span>{" "}
                      {formatTokenCount(usage().cache_read_input_tokens!)}
                    </div>
                  </Show>
                </div>
                <Show when={cost()}>
                  <div class="text-primary mt-2 font-700">
                    {t3({
                      en: "Cost:",
                      fr: "Coût :",
                      pt: "Custo:",
                      th: "ค่าใช้จ่าย:",
                    })} {formatCost(cost()!.totalCost)}
                  </div>
                </Show>
              </div>
            </Match>
          </Switch>
        );
      }}
    </Show>
  );
}
