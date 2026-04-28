import { t3, type MetricGroup, type MetricWithStatus } from "lib";
import { For, Show } from "solid-js";
import { getDisplayDisaggregationLabel } from "~/state/instance/disaggregation_label";

type Props = {
  metricGroup: MetricGroup;
  selectedMetricId: string;
  onSelect: (metricId: string) => void;
};

function getStatusTooltip(status: MetricWithStatus["status"]): string {
  switch (status) {
    case "module_not_installed":
      return t3({ en: "Module not installed", fr: "Module non installé" });
    case "results_not_ready":
      return t3({ en: "Module not yet run", fr: "Module pas encore exécuté" });
    case "error":
      return t3({ en: "Module has errors", fr: "Le module a des erreurs" });
    default:
      return "";
  }
}

export function MetricCard(p: Props) {
  const hasVariants = () => p.metricGroup.variants.length > 1;
  const firstMetric = () => p.metricGroup.variants[0];

  const isGroupSelected = () =>
    p.metricGroup.variants.some((v) => v.id === p.selectedMetricId);

  const canSelectGroup = () =>
    !hasVariants() && firstMetric().status === "ready";

  const handleGroupClick = () => {
    if (canSelectGroup()) {
      p.onSelect(firstMetric().id);
    }
  };

  return (
    <div
      class="ui-pad border-base-300 rounded border transition-colors"
      classList={{
        "bg-primary/5 border-primary": isGroupSelected(),
        "bg-base-100": !isGroupSelected(),
        "ui-hoverable cursor-pointer": canSelectGroup(),
        "opacity-50": !hasVariants() && firstMetric().status !== "ready",
      }}
      onClick={handleGroupClick}
      title={
        !hasVariants() && firstMetric().status !== "ready"
          ? getStatusTooltip(firstMetric().status)
          : undefined
      }
    >
      <div class="ui-spy-sm">
        <div class="font-700">{p.metricGroup.label}</div>

        {/* <div class="flex flex-wrap gap-1">
          <For each={firstMetric().disaggregationOptions.slice(0, 4)}>
            {(disOpt) => (
              <span class="bg-base-200 text-neutral rounded px-1.5 py-0.5 text-xs">
                {t3(getDisplayDisaggregationLabel(disOpt.value))}
              </span>
            )}
          </For>
          <Show when={firstMetric().disaggregationOptions.length > 4}>
            <span class="text-neutral text-xs">
              +{firstMetric().disaggregationOptions.length - 4}
            </span>
          </Show>
        </div> */}

        <Show when={(firstMetric().vizPresets?.length ?? 0) > 0}>
          <div class="text-primary text-xs">
            {firstMetric().vizPresets!.length}{" "}
            {firstMetric().vizPresets!.length === 1
              ? t3({ en: "preset", fr: "préréglage" })
              : t3({ en: "presets", fr: "préréglages" })}
          </div>
        </Show>

        <Show when={hasVariants()}>
          <div class="border-base-300 border-t pt-2">
            <div class="text-neutral mb-1 text-xs">
              {t3({ en: "Select geographic level:", fr: "Sélectionnez le niveau géographique :" })}
            </div>
            <div class="flex flex-wrap gap-1">
            <For each={p.metricGroup.variants.filter((v) => v.status === "ready")}>
              {(variant) => (
                <VariantRow
                  variant={variant}
                  isSelected={p.selectedMetricId === variant.id}
                  onSelect={() => p.onSelect(variant.id)}
                />
              )}
            </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

type VariantRowProps = {
  variant: MetricWithStatus;
  isSelected: boolean;
  onSelect: () => void;
};

function VariantRow(p: VariantRowProps) {
  return (
    <div
      class="rounded px-2 py-1 text-sm transition-colors cursor-pointer"
      classList={{
        "bg-primary/10 font-700": p.isSelected,
        "bg-base-200 ui-hoverable": !p.isSelected,
      }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
      }}
    >
      {p.variant.variantLabel || t3({ en: "Default", fr: "Par défaut" })}
    </div>
  );
}
