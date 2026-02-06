import { PeriodBounds, PeriodFilter } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  RadioGroup,
  Slider,
  timActionForm,
} from "panther";
import { createSignal, Match, Show, Switch } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  visualizationIds: string[];
  periodBounds?: PeriodBounds;
};

type ReturnType = { lastUpdated: string } | undefined;

export function EditCommonPropertiesModal(
  p: AlertComponentProps<Props, ReturnType>
) {
  const [enablePeriodFilter, setEnablePeriodFilter] = createSignal(false);

  const [tempPeriodFilter, setTempPeriodFilter] = createStore<PeriodFilter>({
    filterType: "last_n_months",
    nMonths: 12,
    periodOption: p.periodBounds?.periodOption ?? "period_id",
    min: p.periodBounds?.min ?? 0,
    max: p.periodBounds?.max ?? 100,
  });

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      if (!enablePeriodFilter()) {
        return { success: false, err: "No properties selected to update" };
      }

      const result = await serverActions.batchUpdatePresentationObjectsPeriodFilter(
        {
          projectId: p.projectId,
          presentationObjectIds: p.visualizationIds,
          periodFilter: unwrap(tempPeriodFilter),
        }
      );

      if (!result.success) {
        return result;
      }

      return { success: true, data: { lastUpdated: result.data.lastUpdated } };
    },
    (data) => {
      if (data) {
        p.close({ lastUpdated: data.lastUpdated });
      }
    }
  );

  const header = `Edit common properties for ${p.visualizationIds.length} visualizations`;

  return (
    <AlertFormHolder
      formId="edit-common-properties"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={!enablePeriodFilter()}
    >
      <div class="space-y-4">
        <div class="text-sm text-neutral">
          Changes will be applied to all {p.visualizationIds.length} selected
          visualizations.
        </div>

        <div class="ui-spy-sm">
          <Checkbox
            label="Update period filter"
            checked={enablePeriodFilter()}
            onChange={(checked) => {
              setEnablePeriodFilter(checked);
              if (checked && p.periodBounds) {
                setTempPeriodFilter({
                  filterType: "last_n_months",
                  nMonths: 12,
                  periodOption: p.periodBounds.periodOption,
                  min: p.periodBounds.min,
                  max: p.periodBounds.max,
                });
              }
            }}
          />

          <Show when={enablePeriodFilter() && p.periodBounds} keyed>
            {(keyedBounds) => {
              return (
                <div class="ui-spy-sm pb-4 pl-4">
                  <RadioGroup
                    value={tempPeriodFilter.filterType}
                    options={
                      p.periodBounds?.periodOption === "year"
                        ? [
                          {
                            value: "last_n_months",
                            label: "Last year",
                          },
                          {
                            value: "custom",
                            label: "Custom",
                          },
                        ]
                        : [
                          {
                            value: "last_n_months",
                            label: "Last N months",
                          },
                          {
                            value: "from_month",
                            label: "From specific month to present",
                          },
                          {
                            value: "last_calendar_year",
                            label: "Last full calendar year",
                          },
                          {
                            value: "custom",
                            label: "Custom",
                          },
                        ]
                    }
                    onChange={(v) => {
                      setTempPeriodFilter("filterType", v as "last_n_months" | "from_month" | "last_calendar_year" | "custom");
                    }}
                  />
                  <Show
                    when={
                      tempPeriodFilter?.filterType === "last_n_months" &&
                      p.periodBounds?.periodOption !== "year"
                    }
                  >
                    <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                      <label class="text-sm">Number of months: {tempPeriodFilter.nMonths ?? 12}</label>
                      <Slider
                        value={tempPeriodFilter.nMonths ?? 12}
                        onChange={(nMonths) => {
                          setTempPeriodFilter("nMonths", nMonths);
                        }}
                        min={1}
                        max={60}
                        step={1}
                      />
                    </div>
                  </Show>
                  <Show
                    when={tempPeriodFilter?.filterType === "from_month"}
                  >
                    <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                      <label class="text-sm">Starting period: {tempPeriodFilter.min}</label>
                      <Slider
                        value={tempPeriodFilter.min}
                        onChange={(min) => {
                          setTempPeriodFilter("min", min);
                        }}
                        min={p.periodBounds?.min ?? 0}
                        max={p.periodBounds?.max ?? 100}
                        step={1}
                      />
                    </div>
                  </Show>
                  <Switch>
                    <Match
                      when={
                        tempPeriodFilter?.filterType === "custom" &&
                        p.periodBounds?.periodOption === "period_id"
                      }
                    >
                      <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                        <label class="text-sm">Start period: {tempPeriodFilter.min}</label>
                        <Slider
                          value={tempPeriodFilter.min}
                          onChange={(min) => {
                            setTempPeriodFilter("min", min);
                          }}
                          min={p.periodBounds?.min ?? 0}
                          max={tempPeriodFilter.max}
                          step={1}
                        />
                        <label class="text-sm">End period: {tempPeriodFilter.max}</label>
                        <Slider
                          value={tempPeriodFilter.max}
                          onChange={(max) => {
                            setTempPeriodFilter("max", max);
                          }}
                          min={tempPeriodFilter.min}
                          max={p.periodBounds?.max ?? 100}
                          step={1}
                        />
                      </div>
                    </Match>
                    <Match
                      when={
                        tempPeriodFilter?.filterType === "custom" &&
                        p.periodBounds?.periodOption === "year"
                      }
                    >
                      <div class="ui-gap-sm ui-pad border-base-300 rounded border">
                        <label class="text-sm">Start year: {tempPeriodFilter.min}</label>
                        <Slider
                          value={tempPeriodFilter.min}
                          onChange={(min) => {
                            setTempPeriodFilter("min", min);
                          }}
                          min={p.periodBounds?.min ?? 2000}
                          max={tempPeriodFilter.max}
                          step={1}
                        />
                        <label class="text-sm">End year: {tempPeriodFilter.max}</label>
                        <Slider
                          value={tempPeriodFilter.max}
                          onChange={(max) => {
                            setTempPeriodFilter("max", max);
                          }}
                          min={tempPeriodFilter.min}
                          max={p.periodBounds?.max ?? 2030}
                          step={1}
                        />
                      </div>
                    </Match>
                  </Switch>
                </div>
              );
            }}
          </Show>
        </div>
      </div>
    </AlertFormHolder>
  );
}
