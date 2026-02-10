import { PeriodBounds, PeriodFilter, t3 } from "lib";
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

  const header = t3({ en: `Edit common properties for ${p.visualizationIds.length} visualizations`, fr: `Modifier les propriétés communes de ${p.visualizationIds.length} visualisations` });

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
          {t3({ en: `Changes will be applied to all ${p.visualizationIds.length} selected visualizations.`, fr: `Les modifications seront appliquées aux ${p.visualizationIds.length} visualisations sélectionnées.` })}
        </div>

        <div class="ui-spy-sm">
          <Checkbox
            label={t3({ en: "Update period filter", fr: "Mettre à jour le filtre de période" })}
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
                            label: t3({ en: "Last year", fr: "Dernière année" }),
                          },
                          {
                            value: "custom",
                            label: t3({ en: "Custom", fr: "Personnalisé" }),
                          },
                        ]
                        : [
                          {
                            value: "last_n_months",
                            label: t3({ en: "Last N months", fr: "Derniers N mois" }),
                          },
                          {
                            value: "from_month",
                            label: t3({ en: "From specific month to present", fr: "À partir d'un mois spécifique jusqu'à aujourd'hui" }),
                          },
                          {
                            value: "last_calendar_year",
                            label: t3({ en: "Last full calendar year", fr: "Dernière année civile complète" }),
                          },
                          {
                            value: "custom",
                            label: t3({ en: "Custom", fr: "Personnalisé" }),
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
                      <label class="text-sm">{t3({ en: "Number of months", fr: "Nombre de mois" })}: {tempPeriodFilter.nMonths ?? 12}</label>
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
                      <label class="text-sm">{t3({ en: "Starting period", fr: "Période de début" })}: {tempPeriodFilter.min}</label>
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
                        <label class="text-sm">{t3({ en: "Start period", fr: "Période de début" })}: {tempPeriodFilter.min}</label>
                        <Slider
                          value={tempPeriodFilter.min}
                          onChange={(min) => {
                            setTempPeriodFilter("min", min);
                          }}
                          min={p.periodBounds?.min ?? 0}
                          max={tempPeriodFilter.max}
                          step={1}
                        />
                        <label class="text-sm">{t3({ en: "End period", fr: "Période de fin" })}: {tempPeriodFilter.max}</label>
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
                        <label class="text-sm">{t3({ en: "Start year", fr: "Année de début" })}: {tempPeriodFilter.min}</label>
                        <Slider
                          value={tempPeriodFilter.min}
                          onChange={(min) => {
                            setTempPeriodFilter("min", min);
                          }}
                          min={p.periodBounds?.min ?? 2000}
                          max={tempPeriodFilter.max}
                          step={1}
                        />
                        <label class="text-sm">{t3({ en: "End year", fr: "Année de fin" })}: {tempPeriodFilter.max}</label>
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
