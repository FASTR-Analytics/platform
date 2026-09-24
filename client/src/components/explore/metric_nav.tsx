import {
  groupMetricsByModule,
  t3,
  type DatasetType,
  type MetricGroup,
  type ModuleTier,
  type RunAuthoringContext,
} from "lib";
import { type ListEntry, SelectList } from "panther";
import { For, Show } from "solid-js";

// A nav entry is one metric label group (the wizard's unit), keyed by its
// first variant's id, under its module and the module's tier.
export type MetricNavGroup = MetricGroup & {
  id: string;
  moduleId: string;
  moduleLabel: string;
  tier: ModuleTier;
};

export function metricNavGroups(
  family: DatasetType,
  ctx: RunAuthoringContext,
): MetricNavGroup[] {
  const modules = ctx.modules.filter((m) => m.family === family);
  return groupMetricsByModule(ctx.metrics, modules).flatMap((mod) =>
    mod.metricGroups.map((group) => ({
      ...group,
      id: group.variants[0].id,
      moduleId: mod.moduleId,
      moduleLabel: mod.moduleLabel,
      tier: mod.tier,
    }))
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

function tierEntries(groups: MetricNavGroup[]): ListEntry<string>[] {
  const entries: ListEntry<string>[] = [];
  let moduleId: string | undefined;
  for (const group of groups) {
    if (group.moduleId !== moduleId) {
      entries.push({ header: group.moduleLabel });
      moduleId = group.moduleId;
    }
    entries.push({ id: group.id, label: group.label });
  }
  return entries;
}

// The family's metric groups, a section per tier and a header per module.
export function MetricNav(p: {
  groups: MetricNavGroup[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <div class="ui-spy">
      <For each={TIERS}>
        {(tier) => (
          <Show when={p.groups.some((g) => g.tier === tier)}>
            <div class="ui-spy-sm">
              <div class="text-sm font-700">{tierLabel(tier)}</div>
              <SelectList
                items={tierEntries(p.groups.filter((g) => g.tier === tier))}
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
