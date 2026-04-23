import {
  DisaggregationDisplayOption,
  IneffectiveDisaggregator,
  IneffectiveReason,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ResultsValue,
  TC,
  getNextAvailableDisaggregationDisplayOption,
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  t3,
} from "lib";
import { Checkbox, RadioGroup, Select } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";
import { getDisplayDisaggregationLabel } from "~/state/instance/disaggregation_label";

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
      <div class="text-md font-700">{t3({ en: "Display (disaggregate)", fr: "Affichage (désagréger)" })}</div>

      <Show when={p.poDetail.resultsValue.valueProps.length > 1}>
        <Show
          when={p.hasMultipleValueProps}
          fallback={
            <div class="ui-spy-sm pb-4">
              <Checkbox
                label={t3({ en: "Data values", fr: "Valeurs des données" })}
                checked={true}
                disabled={true}
                onChange={() => {}}
              />
              <Show when={hasValuesFilter()}>
                <div class="text-xs text-warning pl-4">
                  {t3(TC.disaggregation_disabled_filtered_to_one)}
                </div>
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
              <span class="">{t3({ en: "Data values", fr: "Valeurs des données" })}</span>
              <span class="text-xs">
                ({t3({ en: "Required for this visualization", fr: "Nécessaire pour cette visualisation" })})
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
          <div class="ui-spy-sm">
            <Checkbox
              label={t3(getDisplayDisaggregationLabel(p.disOpt.value))}
              checked={false}
              disabled={true}
              onChange={() => {}}
            />
            <div class="text-xs text-warning pl-4">
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
                p.setTempConfig("d", "selectedReplicantValue", undefined);
              } else {
                p.setTempConfig("d", "disaggregateBy", (prev) =>
                  prev.filter((d) => d.disOpt !== p.disOpt.value),
                );
                p.setTempConfig("d", "selectedReplicantValue", undefined);
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
                <span class="">{t3(getDisplayDisaggregationLabel(p.disOpt.value))}</span>
                <span class="text-xs">
                  ({t3({ en: "Required for this visualization", fr: "Nécessaire pour cette visualisation" })})
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
                {t3({ en: "Error with required disaggregator", fr: "Erreur avec le désagrégateur requis" })}
              </div>
            }
            keyed
          >
            {(keyedDis) => {
              return (
                <DisaggregationOptionSettings
                  disOpt={p.disOpt}
                  keyedDis={keyedDis}
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
  disOpt: any;
  keyedDis: any;
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
          p.setTempConfig("d", "selectedReplicantValue", undefined);
        }}
        fullWidth
      />
      <Show
        when={
          p.disOpt.value === "admin_area_2" &&
          p.keyedDis.disDisplayOpt !== "replicant" &&
          p.keyedDis.disDisplayOpt !== "mapArea"
        }
      >
        <AdminAreaOptions
          tempConfig={p.tempConfig}
          setTempConfig={p.setTempConfig}
        />
      </Show>
    </div>
  );
}

type AdminAreaOptionsProps = {
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function AdminAreaOptions(p: AdminAreaOptionsProps) {
  return (
    <div class="text-right">
      <Checkbox
        label={t3({ en: "Include National results", fr: "Inclure les résultats nationaux" })}
        checked={!!p.tempConfig.d.includeNationalForAdminArea2}
        onChange={(v) =>
          p.setTempConfig("d", "includeNationalForAdminArea2", v)
        }
      />
      <Show when={p.tempConfig.d.includeNationalForAdminArea2}>
        <div class="flex justify-end pt-1.5 text-sm">
          <RadioGroup
            value={p.tempConfig.d.includeNationalPosition}
            options={[
              { value: "top", label: t3({ en: "Top", fr: "Haut" }) },
              { value: "bottom", label: t3({ en: "Bottom", fr: "Bas" }) },
            ]}
            horizontal
            onChange={(v) =>
              p.setTempConfig(
                "d",
                "includeNationalPosition",
                v as "bottom" | "top",
              )
            }
          />
        </div>
      </Show>
    </div>
  );
}
