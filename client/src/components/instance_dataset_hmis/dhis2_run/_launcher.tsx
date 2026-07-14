import {
  getCalendar,
  t3,
  type Dhis2Credentials,
  type Dhis2RunPair,
  type Dhis2RunSelection,
  type RawIndicatorWithMappings,
} from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  Table,
  createFormAction,
  createQuery,
  toNum0,
  type CalendarType,
  type TableColumn,
} from "panther";
import { Match, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";
import { Dhis2CredentialsEditor } from "../../Dhis2CredentialsEditor";
import { PeriodSelector } from "../../PeriodSelector";

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
  const gregorianMonth = now.getMonth() + 1;

  if (calendar === "ethiopian") {
    if (gregorianMonth >= 9) {
      return (gregorianYear - 7) * 100 + (gregorianMonth - 8);
    }
    return (gregorianYear - 8) * 100 + (gregorianMonth + 4);
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

  // Default start = 12 months of data ending at the current month.
  let defaultStartYear = currentYear;
  let defaultStartMonth = currentMonth;
  if (currentMonth === 12) {
    defaultStartMonth = 1;
  } else {
    defaultStartYear = currentYear - 1;
    defaultStartMonth = currentMonth + 1;
  }

  const min = calendar === "ethiopian" ? 200501 : 201501;
  const defaultStart = Math.max(defaultStartYear * 100 + defaultStartMonth, min);
  return { min, max: current, defaultStart, defaultEnd: current };
}

type Props = {
  lastUrl: string | undefined;
  presetPairs: Dhis2RunPair[] | undefined;
  presetLabel: string | undefined;
  onLaunched: () => Promise<void>;
};

export function Dhis2RunLauncher(p: Props) {
  const calendar = getCalendar();
  const periods = getMinMaxPeriods(calendar);

  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: p.lastUrl ?? "",
    username: "",
    password: "",
  });
  const [saveCredentialsToSession, setSaveCredentialsToSession] =
    createSignal<boolean>(false);

  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>(
    [],
  );
  const [startPeriod, setStartPeriod] = createSignal<number>(
    periods.defaultStart,
  );
  const [endPeriod, setEndPeriod] = createSignal<number>(periods.defaultEnd);

  const indicators = createQuery(
    () => serverActions.getIndicators({}),
    t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  );

  const tableColumns: TableColumn<RawIndicatorWithMappings>[] = [
    {
      key: "raw_indicator_id",
      header: t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" }),
      sortable: true,
    },
    {
      key: "raw_indicator_label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "indicator_common_ids",
      header: t3({ en: "Common IDs", fr: "ID communs", pt: "ID comuns" }),
      render: (item) => item.indicator_common_ids.join(", "),
    },
  ];

  const selectedKeysSet = () => new Set(selectedIndicators());

  const launch = createFormAction(async () => {
    const creds = credentials();
    if (!creds.url || !creds.username || !creds.password) {
      return {
        success: false,
        err: t3({
          en: "All DHIS2 connection fields are required",
          fr: "Tous les champs de connexion DHIS2 sont requis",
          pt: "Todos os campos de ligação DHIS2 são obrigatórios",
        }),
      };
    }

    let selection: Dhis2RunSelection;
    if (p.presetPairs && p.presetPairs.length > 0) {
      selection = { kind: "pairs", pairs: p.presetPairs };
    } else {
      if (selectedIndicators().length === 0) {
        return {
          success: false,
          err: t3({
            en: "Please select at least one indicator",
            fr: "Veuillez sélectionner au moins un indicateur",
            pt: "Selecione pelo menos um indicador",
          }),
        };
      }
      if (startPeriod() > endPeriod()) {
        return {
          success: false,
          err: t3({
            en: "Start period must be before end period",
            fr: "La période de début doit précéder la période de fin",
            pt: "O período de início deve ser anterior ao período de fim",
          }),
        };
      }
      selection = {
        kind: "window",
        rawIndicatorIds: selectedIndicators(),
        startPeriod: startPeriod(),
        endPeriod: endPeriod(),
      };
    }

    const res = await serverActions.launchDatasetHmisDhis2Run({
      credentials: creds,
      selection,
    });
    if (res.success && saveCredentialsToSession()) {
      setDhis2SessionCredentials(creds);
    }
    return res;
  }, p.onLaunched);

  return (
    <div class="ui-spy">
      <div class="font-700 text-lg">
        {t3({
          en: "Start a new DHIS2 import",
          fr: "Démarrer une nouvelle importation DHIS2",
          pt: "Iniciar uma nova importação DHIS2",
        })}
      </div>
      <div class="text-sm">
        {t3({
          en: "Each (indicator, month) pair is fetched and integrated on its own — pairs that succeed are kept even if others fail, and progress is visible per indicator in the import status view.",
          fr: "Chaque paire (indicateur, mois) est récupérée et intégrée individuellement — les paires réussies sont conservées même si d'autres échouent, et la progression est visible par indicateur dans l'état des importations.",
          pt: "Cada par (indicador, mês) é obtido e integrado individualmente — os pares bem-sucedidos são mantidos mesmo que outros falhem, e o progresso é visível por indicador no estado das importações.",
        })}
      </div>

      <div class="border-base-300 ui-pad rounded border">
        <Dhis2CredentialsEditor
          credentials={credentials}
          setCredentials={setCredentials}
          saveToSession={saveCredentialsToSession}
          setSaveToSession={setSaveCredentialsToSession}
        />
      </div>

      <Switch>
        <Match when={p.presetPairs && p.presetPairs.length > 0}>
          <div class="border-base-300 ui-pad rounded border text-sm">
            {p.presetLabel}{" "}
            <span class="font-700">
              {toNum0(p.presetPairs?.length ?? 0)}{" "}
              {t3({
                en: "(indicator, month) pairs",
                fr: "paires (indicateur, mois)",
                pt: "pares (indicador, mês)",
              })}
            </span>
          </div>
        </Match>
        <Match when={!p.presetPairs || p.presetPairs.length === 0}>
        <div class="ui-gap flex">
          <div class="flex-1">
            <label class="font-700 mb-4 block text-base">
              {t3({
                en: "Select indicators to import",
                fr: "Sélectionner les indicateurs à importer",
                pt: "Selecionar os indicadores a importar",
              })}
            </label>
            <StateHolderWrapper state={indicators.state()} noPad>
              {(keyedIndicators) => (
                <Table
                  data={keyedIndicators.rawIndicators}
                  columns={tableColumns}
                  keyField="raw_indicator_id"
                  selectedKeys={selectedKeysSet}
                  setSelectedKeys={(keys) =>
                    setSelectedIndicators(Array.from(keys) as string[])
                  }
                  selectionLabel={t3({ en: "indicator", fr: "indicateur", pt: "indicador" })}
                  tableContentMaxHeight="500px"
                  noRowsMessage={t3({
                    en: "No indicators available",
                    fr: "Aucun indicateur disponible",
                    pt: "Nenhum indicador disponível",
                  })}
                />
              )}
            </StateHolderWrapper>
          </div>
          <div class="flex-1">
            <label class="font-700 mb-4 block text-base">
              {t3({
                en: "Select period range",
                fr: "Sélectionner la plage de périodes",
                pt: "Selecionar o intervalo de períodos",
              })}
            </label>
            <PeriodSelector
              minPeriodId={periods.min}
              maxPeriodId={periods.max}
              selectedStartPeriodId={startPeriod()}
              selectedEndPeriodId={endPeriod()}
              periodType="year-month"
              onChangeStart={setStartPeriod}
              onChangeEnd={setEndPeriod}
            />
            <div class="border-base-300 ui-pad-sm mt-6 rounded border text-sm">
              {t3({ en: "Selected", fr: "Sélectionné", pt: "Selecionado" })}:{" "}
              {toNum0(selectedIndicators().length)}{" "}
              {t3({ en: "indicators", fr: "indicateurs", pt: "indicadores" })} ×{" "}
              {toNum0(getNMonths(startPeriod(), endPeriod()))}{" "}
              {t3({ en: "months", fr: "mois", pt: "meses" })} ={" "}
              {toNum0(
                selectedIndicators().length *
                  getNMonths(startPeriod(), endPeriod()),
              )}{" "}
              {t3({
                en: "(indicator, month) pairs",
                fr: "paires (indicateur, mois)",
                pt: "pares (indicador, mês)",
              })}
            </div>
          </div>
        </div>
        </Match>
      </Switch>

      <StateHolderFormError state={launch.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={launch.click}
          intent="success"
          state={launch.state()}
          iconName="databaseImport"
        >
          {t3({
            en: "Start import",
            fr: "Démarrer l'importation",
            pt: "Iniciar a importação",
          })}
        </Button>
      </div>
    </div>
  );
}
