import {
  compareModules,
  t3,
  type DatasetType,
  type InstalledModuleSummary,
  type ModuleTier,
  type RunAuthoringContext,
} from "lib";
import { SelectList } from "panther";
import { For, Show } from "solid-js";

// The family's modules in module order (tier, then sortOrder).
export function modulesInFamily(
  family: DatasetType,
  ctx: RunAuthoringContext,
): InstalledModuleSummary[] {
  return ctx.modules.filter((m) => m.family === family).toSorted(
    compareModules,
  );
}

const TIERS: readonly ModuleTier[] = ["primary", "secondary"];

function tierLabel(tier: ModuleTier): string {
  return tier === "primary"
    ? t3({
      en: "Primary results",
      fr: "Résultats principaux",
      pt: "Resultados principais",
    })
    : t3({
      en: "Supporting analyses",
      fr: "Analyses complémentaires",
      pt: "Análises complementares",
    });
}

// The family's modules, a section per tier.
export function ModuleNav(p: {
  modules: InstalledModuleSummary[];
  value: string | undefined;
  onChange: (moduleId: string) => void;
}) {
  return (
    <div class="ui-spy">
      <For each={TIERS}>
        {(tier) => (
          <Show when={p.modules.some((m) => m.tier === tier)}>
            <div class="ui-spy-sm">
              <div class="text-sm font-700">{tierLabel(tier)}</div>
              <SelectList
                items={p.modules
                  .filter((m) => m.tier === tier)
                  .map((m) => ({ id: m.id, label: m.label }))}
                value={p.value ?? ""}
                onChange={p.onChange}
                fullWidth
              />
            </div>
          </Show>
        )}
      </For>
    </div>
  );
}
