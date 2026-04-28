import {
  t3,
  get_PRESENTATION_SELECT_OPTIONS,
  type MetricWithStatus,
  type PresentationOption,
  type DisaggregationOption,
} from "lib";
import { Checkbox } from "panther";
import { For, Show } from "solid-js";
import { getDisplayDisaggregationLabel } from "~/state/instance/disaggregation_label";
import { TypeCard } from "./type_card";

type Props = {
  metric: MetricWithStatus;
  selectedType: PresentationOption | undefined;
  selectedDisaggregations: DisaggregationOption[];
  onSelectType: (type: PresentationOption) => void;
  onToggleDisaggregation: (disOpt: DisaggregationOption, checked: boolean) => void;
};

export function Step3Configure(p: Props) {
  const typeOptions = () =>
    get_PRESENTATION_SELECT_OPTIONS(p.metric.disaggregationOptions);

  const allTypes: PresentationOption[] = ["table", "timeseries", "chart", "map"];

  const getDisabledReason = (type: PresentationOption): string | undefined => {
    const option = typeOptions().find((o) => o.value === type);
    if (option) return undefined;

    switch (type) {
      case "timeseries":
        return t3({ en: "Requires period disaggregation", fr: "Nécessite une désagrégation par période" });
      case "map":
        return t3({ en: "Requires area disaggregation", fr: "Nécessite une désagrégation par zone" });
      default:
        return t3({ en: "Not available for this metric", fr: "Non disponible pour cette métrique" });
    }
  };

  const availableDisaggregations = () => {
    const type = p.selectedType;
    if (!type) return [];
    return p.metric.disaggregationOptions.filter(
      (disOpt) =>
        !disOpt.allowedPresentationOptions ||
        disOpt.allowedPresentationOptions.includes(type)
    );
  };

  return (
    <div class="ui-pad ui-spy">
      <div>
        <div class="font-700 mb-3">
          {t3({ en: "Visualization type", fr: "Type de visualisation" })}
        </div>
        <div class="ui-gap-sm grid grid-cols-4">
          <For each={allTypes}>
            {(type) => (
              <TypeCard
                type={type}
                isSelected={p.selectedType === type}
                isDisabled={!typeOptions().some((o) => o.value === type)}
                disabledReason={getDisabledReason(type)}
                onSelect={() => p.onSelectType(type)}
              />
            )}
          </For>
        </div>
      </div>

      <Show when={p.selectedType}>
        <div>
          <div class="font-700 mb-3">
            {t3({ en: "Disaggregate by", fr: "Désagréger par" })}
          </div>

          <Show
            when={availableDisaggregations().length > 0}
            fallback={
              <div class="text-neutral text-sm">
                {t3({
                  en: "No disaggregation options available for this visualization type",
                  fr: "Aucune option de désagrégation disponible pour ce type de visualisation",
                })}
              </div>
            }
          >
            <div class="ui-spy-sm">
              <For each={availableDisaggregations()}>
                {(disOpt) => {
                  const isRequired = disOpt.isRequired;
                  const isChecked = isRequired || p.selectedDisaggregations.includes(disOpt.value);

                  return (
                    <Checkbox
                      label={
                        <>
                          {t3(getDisplayDisaggregationLabel(disOpt.value))}
                          <Show when={isRequired}>
                            <span class="text-neutral ml-2 text-xs">
                              ({t3({ en: "required", fr: "requis" })})
                            </span>
                          </Show>
                        </>
                      }
                      checked={isChecked}
                      disabled={isRequired}
                      onChange={(checked) => {
                        if (!isRequired) {
                          p.onToggleDisaggregation(disOpt.value, checked);
                        }
                      }}
                    />
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
