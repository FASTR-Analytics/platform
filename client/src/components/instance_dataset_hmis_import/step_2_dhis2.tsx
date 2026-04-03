import { Dhis2SelectionParams,
  getCalendar,
  t3,
  type RawIndicatorWithMappings } from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  Table,
  timActionForm,
  timQuery,
  type CalendarType,
  type TableColumn,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { PeriodSelector } from "../PeriodSelector";

// Helper functions for period calculations
function getNMonths(startPeriod: number, endPeriod: number): number {
  const startYear = Math.floor(startPeriod / 100);
  const startMonth = startPeriod % 100;
  const endYear = Math.floor(endPeriod / 100);
  const endMonth = endPeriod % 100;
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

function getCurrentPeriodId(calendar: CalendarType): number {
  const now = new Date();
  const gregorianYear = now.getFullYear();
  const gregorianMonth = now.getMonth() + 1; // JS months are 0-based

  if (calendar === "ethiopian") {
    let ethiopianYear: number;
    let ethiopianMonth: number;

    if (gregorianMonth >= 9) {
      // Sept-Dec → Ethiopian months 1-4, same Ethiopian year
      ethiopianYear = gregorianYear - 7;
      ethiopianMonth = gregorianMonth - 8;
    } else {
      // Jan-Aug → Ethiopian months 5-12, previous Ethiopian year
      ethiopianYear = gregorianYear - 8;
      ethiopianMonth = gregorianMonth + 4;
    }

    return ethiopianYear * 100 + ethiopianMonth;
  }

  return gregorianYear * 100 + gregorianMonth;
}

function getMinMaxPeriods(calendar: CalendarType): {
  min: number;
  max: number;
  defaultStart: number;
  defaultEnd: number;
} {
  const current = getCurrentPeriodId(calendar);
  const currentYear = Math.floor(current / 100);
  const currentMonth = current % 100;

  // Calculate default start as 12 months before current period (11 months back + current month = 12 total)
  let defaultStartYear = currentYear;
  let defaultStartMonth = currentMonth;

  if (currentMonth === 12) {
    // December: go back to January of current year (12 months total)
    defaultStartMonth = 1;
  } else {
    // Other months: go back one year and forward one month
    defaultStartYear = currentYear - 1;
    defaultStartMonth = currentMonth + 1;
  }

  const defaultStart = Math.max(
    defaultStartYear * 100 + defaultStartMonth,
    calendar === "ethiopian" ? 200501 : 201501, // Ensure not before min
  );

  if (calendar === "ethiopian") {
    return {
      min: 200501, // Ethiopian year 2005, month 1
      max: current, // Current month exactly
      defaultStart,
      defaultEnd: current, // Current period
    };
  }

  return {
    min: 201501, // Gregorian year 2015, month 1
    max: current, // Current month exactly
    defaultStart,
    defaultEnd: current, // Current period
  };
}

type Props = {
  step2Result: Dhis2SelectionParams | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2_Dhis2(p: Props) {
  const calendar = getCalendar();
  const periods = getMinMaxPeriods(calendar);

  const [tempIndicators, setTempIndicators] = createSignal<string[]>(
    p.step2Result?.rawIndicatorIds ?? [],
  );
  const [tempStartPeriod, setTempStartPeriod] = createSignal<number>(
    p.step2Result?.startPeriod ?? periods.defaultStart,
  );
  const [tempEndPeriod, setTempEndPeriod] = createSignal<number>(
    p.step2Result?.endPeriod ?? periods.defaultEnd,
  );

  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  // Get indicators list from server
  // TODO: Replace with actual server action when available
  // const indicators = timQuery(
  //   async () => ({
  //     success: true as const,
  //     data: [] as { id: string; label: string }[],
  //   }),
  //   t("Loading indicators..."),
  // );
  const indicators = timQuery(
    () => serverActions.getIndicators({}),
    t3({ en: "Loading indicators...", fr: "Chargement des indicateurs..." }),
  );

  const tableColumns: TableColumn<RawIndicatorWithMappings>[] = [
    {
      key: "raw_indicator_id",
      header: t3({ en: "Indicator ID", fr: "ID indicateur" }),
      sortable: true,
    },
    {
      key: "raw_indicator_label",
      header: t3({ en: "Label", fr: "Libellé" }),
      sortable: true,
    },
    {
      key: "indicator_common_ids",
      header: t3({ en: "Common IDs", fr: "ID communs" }),
      render: (item) => item.indicator_common_ids.join(", "),
    },
  ];

  // Convert tempIndicators to Set for Table component
  const selectedKeysSet = () => new Set(tempIndicators());

  const updateSelectedKeys = (keys: Set<any>) => {
    const selectedIds = Array.from(keys) as string[];
    setTempIndicators(selectedIds);
    setNeedsSaving(true);
  };

  function updatePeriods() {
    setNeedsSaving(true);
  }

  const save = timActionForm(async () => {
    const params: Dhis2SelectionParams = {
      rawIndicatorIds: tempIndicators(),
      startPeriod: tempStartPeriod(),
      endPeriod: tempEndPeriod(),
    };

    if (params.rawIndicatorIds.length === 0) {
      return {
        success: false,
        err: t3({ en: "Please select at least one indicator", fr: "Veuillez sélectionner au moins un indicateur" }),
      };
    }

    if (params.startPeriod > params.endPeriod) {
      return {
        success: false,
        err: t3({ en: "Start period must be before end period", fr: "La période de début doit précéder la période de fin" }),
      };
    }

    return serverActions.dhis2SetSelection(params);
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 pb-4 text-lg">{t3({ en: "DHIS2 Data Selection", fr: "Sélection des données DHIS2" })}</div>
        <div class="ui-gap flex">
          <div class="flex-1">
            <label class="font-700 mb-4 block text-base">
              {t3({ en: "Select indicators to import", fr: "Sélectionner les indicateurs à importer" })}
            </label>
            <StateHolderWrapper state={indicators.state()} noPad>
              {(keyedIndicators) => (
                <Table
                  data={keyedIndicators.rawIndicators}
                  columns={tableColumns}
                  keyField="raw_indicator_id"
                  selectedKeys={selectedKeysSet}
                  setSelectedKeys={updateSelectedKeys}
                  selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
                  tableContentMaxHeight="500px"
                  noRowsMessage={t3({ en: "No indicators available", fr: "Aucun indicateur disponible" })}
                />
              )}
            </StateHolderWrapper>
          </div>

          <div class="flex-1">
            <label class="font-700 mb-4 block text-base">
              {t3({ en: "Select Period Range", fr: "Sélectionner la plage de périodes" })}
            </label>
            <PeriodSelector
              minPeriodId={periods.min}
              maxPeriodId={periods.max}
              selectedStartPeriodId={tempStartPeriod()}
              selectedEndPeriodId={tempEndPeriod()}
              periodType="year-month"
              onChangeStart={(periodId) => {
                setTempStartPeriod(periodId);
                updatePeriods();
              }}
              onChangeEnd={(periodId) => {
                setTempEndPeriod(periodId);
                updatePeriods();
              }}
            />
          </div>
        </div>

        <div class="border-base-300 mt-12 rounded border p-3 text-sm">
          <div class="text-base-content">
            {t3({ en: "Selected", fr: "Sélectionné" })}: {tempIndicators().length} {t3({ en: "indicators", fr: "indicateurs" })} ×{" "}
            {getNMonths(tempStartPeriod(), tempEndPeriod())} {t3({ en: "periods", fr: "périodes" })} ={" "}
            {tempIndicators().length *
              getNMonths(tempStartPeriod(), tempEndPeriod())}{" "}
            {t3({ en: "data points to fetch", fr: "points de données à récupérer" })}
          </div>
        </div>
      </div>

      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving()}
          iconName="save"
        >
          {t3({ en: "Save selection", fr: "Sauvegarder la sélection" })}
        </Button>
      </div>
    </div>
  );
}
