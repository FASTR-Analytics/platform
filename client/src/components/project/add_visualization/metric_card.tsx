import { t3, type MetricGroup, type MetricWithStatus } from "lib";
import { For, Show } from "solid-js";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";

type Props = {
  metricGroup: MetricGroup;
  selectedMetricId: string;
  onSelect: (metricId: string) => void;
};

function getStatusTooltip(status: MetricWithStatus["status"]): string {
  switch (status) {
    case "module_not_installed":
      return t3({ en: "Module not installed", fr: "Module non installé", pt: "Módulo não instalado" });
    case "results_not_ready":
      return t3({ en: "Module not yet run", fr: "Module pas encore exécuté", pt: "Módulo ainda não executado" });
    case "error":
      return t3({ en: "Module has errors", fr: "Le module a des erreurs", pt: "O módulo tem erros" });
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
      class="ui-pad border-border rounded border transition-colors"
      classList={{
        "bg-primary-subtle border-primary": isGroupSelected(),
        "bg-base-100": !isGroupSelected(),
        "cursor-pointer select-none hover:bg-base-100-hover active:bg-base-100-active": canSelectGroup() && !isGroupSelected(),
        "cursor-pointer": canSelectGroup(),
        "opacity-40": !hasVariants() && firstMetric().status !== "ready",
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
              <span class="bg-base-200 ui-text-caption rounded px-1.5 py-0.5">
                {t3(getDisplayDisaggregationLabel(disOpt.value))}
              </span>
            )}
          </For>
          <Show when={firstMetric().disaggregationOptions.length > 4}>
            <span class="ui-text-caption">
              +{firstMetric().disaggregationOptions.length - 4}
            </span>
          </Show>
        </div> */}

        <Show when={(firstMetric().vizPresets?.length ?? 0) > 0}>
          <div class="text-primary text-xs">
            {firstMetric().vizPresets!.length}{" "}
            {firstMetric().vizPresets!.length === 1
              ? t3({ en: "preset", fr: "préréglage", pt: "predefinição" })
              : t3({ en: "presets", fr: "préréglages", pt: "predefinições" })}
          </div>
        </Show>

        <Show when={hasVariants()}>
          <div class="border-border border-t pt-2">
            <div class="ui-text-caption mb-1">
              {t3({ en: "Select geographic level:", fr: "Sélectionnez le niveau géographique :", pt: "Selecione o nível geográfico:" })}
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
        "bg-primary-subtle font-700": p.isSelected,
        "bg-base-200 cursor-pointer select-none hover:bg-base-200-hover active:bg-base-200-active": !p.isSelected,
      }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
      }}
    >
      {p.variant.variantLabel || t3({ en: "Default", fr: "Par défaut", pt: "Predefinição" })}
    </div>
  );
}
