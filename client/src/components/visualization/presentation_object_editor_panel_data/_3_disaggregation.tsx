import {
  DisaggregationDisplayOption,
  IneffectiveDisaggregator,
  IneffectiveReason,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ResultsValue,
  TC,
  getNextAvailableDisaggregationDisplayOption,
  getRollupAdminLevel,
  getRollupLabelContext,
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  isRollupEligibleResultsValue,
  t3,
} from "lib";
import { Checkbox, RadioGroup, Select } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { getDisplayDisaggregationLabel } from "~/state/instance/_util_disaggregation_label";

type DisaggregationSectionProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  allDisaggregationOptions: ResultsValue["disaggregationOptions"];
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
  effectiveValueProps: string[];
  hasMultipleValueProps: boolean;
};

export function DisaggregationSection(p: DisaggregationSectionProps) {
  const hasValuesFilter = () =>
    !!p.tempConfig.d.valuesFilter && p.tempConfig.d.valuesFilter.length > 0;

  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">
        {t3({ en: "Display (disaggregate)", fr: "Affichage (désagréger)" })}
      </div>

      <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
        <Show
          when={p.hasMultipleValueProps}
          fallback={
            <div class="pb-4">
              <Checkbox
                label={t3({ en: "Data values", fr: "Valeurs des données" })}
                checked={true}
                disabled={true}
                onChange={() => {}}
              />
              <Show when={hasValuesFilter()}>
                <span class="text-warning pl-7 text-xs">
                  {t3(TC.disaggregation_disabled_filtered_to_one)}
                </span>
              </Show>
            </div>
          }
        >
          <DataValuesDisaggregation
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
          />
        </Show>
      </Show>

      <For each={p.allDisaggregationOptions}>
        {(disOpt) => (
          <DisaggregationOption
            disOpt={disOpt}
            poDetail={p.poDetail}
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
            ineffectiveDisaggregators={p.ineffectiveDisaggregators}
            effectiveValueProps={p.effectiveValueProps}
          />
        )}
      </For>
    </div>
  );
}

type DataValuesDisaggregationProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DataValuesDisaggregation(p: DataValuesDisaggregationProps) {
  return (
    <div class="ui-spy-sm pb-4">
      <Checkbox
        label={
          <>
            <div class="flex flex-wrap items-center gap-x-1">
              <span class="">
                {t3({ en: "Data values", fr: "Valeurs des données" })}
              </span>
              <span class="text-xs">
                (
                {t3({
                  en: "Required for this visualization",
                  fr: "Nécessaire pour cette visualisation",
                })}
                )
              </span>
            </div>
          </>
        }
        checked={true}
        onChange={() => {}}
        disabled={true}
      />
      <Select
        options={get_DISAGGREGATION_DISPLAY_OPTIONS()[
          p.tempConfig.d.type
        ].filter((opt) => opt.value !== "replicant" && opt.value !== "mapArea")}
        value={p.tempConfig.d.valuesDisDisplayOpt}
        onChange={(v) =>
          p.setTempConfig(
            "d",
            "valuesDisDisplayOpt",
            v as DisaggregationDisplayOption,
          )
        }
        fullWidth
      />
    </div>
  );
}

type DisaggregationOptionProps = {
  disOpt: DisaggregationSectionProps["allDisaggregationOptions"][number];
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  ineffectiveDisaggregators: IneffectiveDisaggregator[];
  effectiveValueProps: string[];
};

function getReasonMessage(reason: IneffectiveReason) {
  switch (reason) {
    case "filtered_to_one_value":
      return TC.disaggregation_disabled_filtered_to_one;
    case "single_period":
      return TC.disaggregation_disabled_single_period;
    case "single_year":
      return TC.disaggregation_disabled_single_year;
  }
}

function DisaggregationOption(p: DisaggregationOptionProps) {
  const ineffective = () =>
    p.ineffectiveDisaggregators.find((d) => d.disOpt === p.disOpt.value);

  return (
    <Switch>
      <Match when={ineffective()} keyed>
        {(ineff) => (
          <div class="">
            <Checkbox
              label={t3(getDisplayDisaggregationLabel(p.disOpt.value))}
              checked={false}
              disabled={true}
              onChange={() => {}}
            />
            <div class="text-warning pl-7 text-xs">
              {t3(getReasonMessage(ineff.reason))}
            </div>
          </div>
        )}
      </Match>
      <Match when={!p.disOpt.isRequired}>
        <div class="ui-spy-sm">
          <Checkbox
            label={t3(getDisplayDisaggregationLabel(p.disOpt.value))}
            checked={p.tempConfig.d.disaggregateBy.some(
              (d) => d.disOpt === p.disOpt.value,
            )}
            onChange={(checked) => {
              if (checked) {
                const disDisplayOpt =
                  getNextAvailableDisaggregationDisplayOption(
                    p.poDetail.resultsValue,
                    p.tempConfig,
                    p.disOpt.value,
                    p.effectiveValueProps,
                  );
                p.setTempConfig("d", "disaggregateBy", (prev) => [
                  ...prev,
                  { disOpt: p.disOpt.value, disDisplayOpt },
                ]);
              } else {
                p.setTempConfig("d", "disaggregateBy", (prev) =>
                  prev.filter((d) => d.disOpt !== p.disOpt.value),
                );
              }
            }}
          />
          <Show
            when={p.tempConfig.d.disaggregateBy.find(
              (d) => d.disOpt === p.disOpt.value,
            )}
            keyed
          >
            {(keyedDis) => {
              return (
                <DisaggregationOptionSettings
                  disOpt={p.disOpt}
                  keyedDis={keyedDis}
                  poDetail={p.poDetail}
                  tempConfig={p.tempConfig}
                  setTempConfig={p.setTempConfig}
                />
              );
            }}
          </Show>
        </div>
      </Match>
      <Match when={p.disOpt.isRequired}>
        <div class="ui-spy-sm">
          <Checkbox
            label={
              <div class="flex flex-wrap items-center gap-x-1">
                <span class="">
                  {t3(getDisplayDisaggregationLabel(p.disOpt.value))}
                </span>
                <span class="text-xs">
                  (
                  {t3({
                    en: "Required for this visualization",
                    fr: "Nécessaire pour cette visualisation",
                  })}
                  )
                </span>
              </div>
            }
            checked={true}
            onChange={() => {}}
            disabled={true}
          />
          <Show
            when={p.tempConfig.d.disaggregateBy.find(
              (d) => d.disOpt === p.disOpt.value,
            )}
            fallback={
              <div class="text-danger">
                {t3({
                  en: "Error with required disaggregator",
                  fr: "Erreur avec le désagrégateur requis",
                })}
              </div>
            }
            keyed
          >
            {(keyedDis) => {
              return (
                <DisaggregationOptionSettings
                  disOpt={p.disOpt}
                  keyedDis={keyedDis}
                  poDetail={p.poDetail}
                  tempConfig={p.tempConfig}
                  setTempConfig={p.setTempConfig}
                />
              );
            }}
          </Show>
        </div>
      </Match>
    </Switch>
  );
}

type DisaggregationOptionSettingsProps = {
  disOpt: DisaggregationSectionProps["allDisaggregationOptions"][number];
  keyedDis: PresentationObjectConfig["d"]["disaggregateBy"][number];
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DisaggregationOptionSettings(p: DisaggregationOptionSettingsProps) {
  return (
    <div class="ui-spy-sm pb-4">
      <Select
        options={get_DISAGGREGATION_DISPLAY_OPTIONS()[p.tempConfig.d.type]}
        value={p.keyedDis.disDisplayOpt}
        onChange={(v) => {
          p.setTempConfig(
            "d",
            "disaggregateBy",
            (d) => d.disOpt === p.keyedDis.disOpt,
            "disDisplayOpt",
            v as DisaggregationDisplayOption,
          );
        }}
        fullWidth
      />
      {/* The roll-up option appears only on the single level the roll-up would
          collapse (config-shape gate). When the METRIC is ineligible
          (isRollupEligibleResultsValue — e.g. pre-aggregated values that can't
          be summed/averaged across areas), show the control disabled with a
          reason rather than hiding it, so the absence is explicable. */}
      <Show when={getRollupAdminLevel(p.tempConfig) === p.disOpt.value}>
        <Show
          when={isRollupEligibleResultsValue(p.poDetail.resultsValue)}
          fallback={
            <div class="flex flex-col items-end">
              <Checkbox
                label={t3({
                  en: "Include National results",
                  fr: "Inclure les résultats nationaux",
                })}
                checked={false}
                disabled={true}
                onChange={() => {}}
              />
              <div class="text-warning text-xs">
                {t3({
                  en: "Not available for this metric (values cannot be aggregated across areas)",
                  fr: "Non disponible pour cette mesure (les valeurs ne peuvent pas être agrégées entre les zones)",
                })}
              </div>
            </div>
          }
        >
          <AdminAreaOptions
            tempConfig={p.tempConfig}
            setTempConfig={p.setTempConfig}
          />
        </Show>
      </Show>
    </div>
  );
}

type AdminAreaOptionsProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function AdminAreaOptions(p: AdminAreaOptionsProps) {
  // The checkbox label mirrors what the roll-up row will actually contain —
  // getRollupLabelContext is the same helper that labels the rendered row.
  // Pinned names the LEVEL, not the pinned value, because with a replicant the
  // value differs per replicant.
  const rollupCheckboxLabel = () => {
    const ctx = getRollupLabelContext(p.tempConfig);
    if (ctx?.kind === "subset") {
      return t3({
        en: "Include results for all selected areas",
        fr: "Inclure les résultats de toutes les zones sélectionnées",
      });
    }
    if (ctx?.kind === "pinned") {
      const name = t3(getDisplayDisaggregationLabel(ctx.level));
      return t3({
        en: `Include ${name} results`,
        fr: `Inclure les résultats : ${name}`,
      });
    }
    return t3({
      en: "Include National results",
      fr: "Inclure les résultats nationaux",
    });
  };
  return (
    <div class="flex flex-col items-end">
      <Checkbox
        label={rollupCheckboxLabel()}
        checked={!!p.tempConfig.d.includeAdminAreaRollup}
        onChange={(v) => {
          p.setTempConfig("d", "includeAdminAreaRollup", v);
          if (v && !p.tempConfig.d.adminAreaRollupPosition) {
            p.setTempConfig("d", "adminAreaRollupPosition", "bottom");
          }
        }}
      />
      <Show when={p.tempConfig.d.includeAdminAreaRollup}>
        <div class="flex justify-end pt-1.5 text-sm">
          <RadioGroup
            value={p.tempConfig.d.adminAreaRollupPosition ?? "bottom"}
            options={[
              { value: "top", label: t3({ en: "Top", fr: "Haut" }) },
              { value: "bottom", label: t3({ en: "Bottom", fr: "Bas" }) },
            ]}
            horizontal
            onChange={(v) =>
              p.setTempConfig(
                "d",
                "adminAreaRollupPosition",
                v as "bottom" | "top",
              )
            }
          />
        </div>
      </Show>
    </div>
  );
}
