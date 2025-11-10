import {
  DisaggregationDisplayOption,
  PresentationObjectConfig,
  PresentationObjectDetail,
  getFilteredValueProps,
  getNextAvailableDisaggregationDisplayOption,
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  t,
  t2,
  T,
  type PresentationOption,
  type DisaggregationOption,
  type TranslatableString,
} from "lib";
import { Checkbox, RadioGroup, Select } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { SetStoreFunction } from "solid-js/store";

type DisaggregationSectionProps = {
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  allowedDisaggregationOptions: {
    value: DisaggregationOption;
    label: string | TranslatableString;
    isRequired: boolean;
    allowedPresentationOptions?: PresentationOption[];
  }[];
};

export function DisaggregationSection(p: DisaggregationSectionProps) {
  return (
    <div class="ui-spy-sm">
      <div class="text-md font-700">{t2(T.FRENCH_UI_STRINGS.disaggregate)}</div>
      <Show
        when={
          getFilteredValueProps(
            p.poDetail.resultsValue.valueProps,
            p.tempConfig,
          ).length > 1
        }
      >
        <DataValuesDisaggregation
          tempConfig={p.tempConfig}
          setTempConfig={p.setTempConfig}
        />
      </Show>

      <For each={p.allowedDisaggregationOptions}>
        {(disOpt) => {
          return (
            <DisaggregationOption
              disOpt={disOpt}
              poDetail={p.poDetail}
              tempConfig={p.tempConfig}
              setTempConfig={p.setTempConfig}
            />
          );
        }}
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
              <span class="">{t2(T.FRENCH_UI_STRINGS.data_values)}</span>
              <span class="text-xs">
                ({t2(T.FRENCH_UI_STRINGS.required_for_this_visualizatio)})
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
        ].filter((opt) => opt.value !== "replicant")}
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
  disOpt: any;
  poDetail: PresentationObjectDetail;
  tempConfig: PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

function DisaggregationOption(p: DisaggregationOptionProps) {
  return (
    <Switch>
      <Match when={!p.disOpt.isRequired}>
        <div class="ui-spy-sm">
          <Checkbox
            label={t2(p.disOpt.label)}
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
                <span class="">{t2(p.disOpt.label)}</span>
                <span class="text-xs">
                  ({t2(T.FRENCH_UI_STRINGS.required_for_this_visualizatio)})
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
                {t("Error with required dissagregator")}
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
          p.keyedDis.disDisplayOpt !== "replicant"
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
        label={t2(T.FRENCH_UI_STRINGS.include_national_results)}
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
              { value: "top", label: t2(T.FRENCH_UI_STRINGS.top) },
              { value: "bottom", label: t2(T.FRENCH_UI_STRINGS.bottom) },
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
