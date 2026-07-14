import {
  getCalendar,
  t3,
  type Dhis2Credentials,
  type Dhis2RunPair,
  type Dhis2RunSelection,
  type Dhis2StoredCredentialsInfo,
} from "lib";
import {
  Button,
  Checkbox,
  StateHolderFormError,
  createFormAction,
  openConfirm,
  toNum0,
  type CalendarType,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { setDhis2SessionCredentials } from "~/state/instance/t4_dhis2_session";
import { Dhis2CredentialsEditor } from "../../Dhis2CredentialsEditor";
import { PeriodSelector } from "../../PeriodSelector";
import { Dhis2IndicatorPicker } from "./_indicator_picker";

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
  storedCredentials: Dhis2StoredCredentialsInfo | undefined;
  // "run" starts immediately (stored or per-run credentials); "queue" asks
  // explicitly, then enqueues behind the active import — queued fires are
  // unattended, so they always use the stored credentials (C6).
  mode: "run" | "queue";
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
  const [useStored, setUseStored] = createSignal<boolean>(
    p.storedCredentials !== undefined,
  );

  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>(
    [],
  );
  const [startPeriod, setStartPeriod] = createSignal<number>(
    periods.defaultStart,
  );
  const [endPeriod, setEndPeriod] = createSignal<number>(periods.defaultEnd);

  function buildSelection():
    | { success: true; selection: Dhis2RunSelection }
    | { success: false; err: string } {
    if (p.presetPairs && p.presetPairs.length > 0) {
      return {
        success: true,
        selection: { kind: "pairs", pairs: p.presetPairs },
      };
    }
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
    return {
      success: true,
      selection: {
        kind: "window",
        rawIndicatorIds: selectedIndicators(),
        startPeriod: startPeriod(),
        endPeriod: endPeriod(),
      },
    };
  }

  const launch = createFormAction(async () => {
    const built = buildSelection();
    if (!built.success) {
      return built;
    }

    if (p.mode === "queue") {
      return await serverActions.enqueueDatasetHmisDhis2Run({
        selection: built.selection,
      });
    }

    if (useStored() && p.storedCredentials) {
      return await serverActions.launchDatasetHmisDhis2Run({
        selection: built.selection,
      });
    }

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
    const res = await serverActions.launchDatasetHmisDhis2Run({
      credentials: creds,
      selection: built.selection,
    });
    if (res.success && saveCredentialsToSession()) {
      setDhis2SessionCredentials(creds);
    }
    return res;
  }, p.onLaunched);

  // Explicit queueing, never a silent default: the user confirms that
  // "import" here means "start after the current one finishes". Cancelling
  // the confirm is a no-op (the form stays open).
  async function submit() {
    if (p.mode === "queue") {
      const confirmed = await openConfirm({
        text: t3({
          en: "An import is running — queue this one to start after it?",
          fr: "Une importation est en cours — mettre celle-ci en file d'attente pour démarrer ensuite ?",
          pt: "Há uma importação em curso — colocar esta em fila para começar depois?",
        }),
        confirmButtonLabel: t3({
          en: "Queue import",
          fr: "Mettre en file d'attente",
          pt: "Colocar em fila",
        }),
      });
      if (!confirmed) {
        return;
      }
    }
    await launch.click();
  }

  return (
    <div class="ui-spy">
      <div class="font-700 text-lg">
        {p.mode === "queue"
          ? t3({
              en: "Queue another import",
              fr: "Mettre une autre importation en file d'attente",
              pt: "Colocar outra importação em fila",
            })
          : t3({
              en: "Start a new DHIS2 import",
              fr: "Démarrer une nouvelle importation DHIS2",
              pt: "Iniciar uma nova importação DHIS2",
            })}
      </div>
      <div class="text-sm">
        {p.mode === "queue"
          ? t3({
              en: "Queued imports start automatically once the current import finishes, using the stored credentials.",
              fr: "Les importations en file d'attente démarrent automatiquement à la fin de l'importation en cours, avec les identifiants enregistrés.",
              pt: "As importações em fila começam automaticamente quando a importação atual terminar, com as credenciais guardadas.",
            })
          : t3({
              en: "Each (indicator, month) pair is fetched and integrated on its own — pairs that succeed are kept even if others fail, and progress is visible per indicator in the import status view.",
              fr: "Chaque paire (indicateur, mois) est récupérée et intégrée individuellement — les paires réussies sont conservées même si d'autres échouent, et la progression est visible par indicateur dans l'état des importations.",
              pt: "Cada par (indicador, mês) é obtido e integrado individualmente — os pares bem-sucedidos são mantidos mesmo que outros falhem, e o progresso é visível por indicador no estado das importações.",
            })}
      </div>

      <Switch>
        <Match when={p.mode === "queue" && !p.storedCredentials}>
          <div class="border-base-300 ui-pad text-danger rounded border text-sm">
            {t3({
              en: "Queued imports need stored DHIS2 credentials — save them in the stored connection section below first.",
              fr: "Les importations en file d'attente nécessitent des identifiants DHIS2 enregistrés — enregistrez-les d'abord dans la section connexion enregistrée ci-dessous.",
              pt: "As importações em fila requerem credenciais DHIS2 guardadas — guarde-as primeiro na secção de ligação guardada abaixo.",
            })}
          </div>
        </Match>
        <Match when={p.mode === "queue" && p.storedCredentials} keyed>
          {(stored) => (
            <div class="border-base-300 ui-pad rounded border text-sm">
              {t3({
                en: "Will run with the stored connection:",
                fr: "S'exécutera avec la connexion enregistrée :",
                pt: "Será executada com a ligação guardada:",
              })}{" "}
              <span class="font-700">{stored.url}</span> — {stored.username}
            </div>
          )}
        </Match>
        <Match when={p.mode === "run"}>
          <div class="border-base-300 ui-pad ui-spy rounded border">
            <Show when={p.storedCredentials} keyed>
              {(stored) => (
                <Checkbox
                  checked={useStored()}
                  onChange={setUseStored}
                  label={`${t3({
                    en: "Use stored credentials",
                    fr: "Utiliser les identifiants enregistrés",
                    pt: "Utilizar as credenciais guardadas",
                  })} (${stored.url} — ${stored.username})`}
                />
              )}
            </Show>
            <Show when={!useStored() || !p.storedCredentials}>
              <Dhis2CredentialsEditor
                credentials={credentials}
                setCredentials={setCredentials}
                saveToSession={saveCredentialsToSession}
                setSaveToSession={setSaveCredentialsToSession}
              />
            </Show>
          </div>
        </Match>
      </Switch>

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
              <Dhis2IndicatorPicker
                selectedIds={selectedIndicators}
                setSelectedIds={setSelectedIndicators}
              />
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
          onClick={submit}
          intent="success"
          state={launch.state()}
          iconName="databaseImport"
          disabled={p.mode === "queue" && !p.storedCredentials}
        >
          {p.mode === "queue"
            ? t3({
                en: "Queue import",
                fr: "Mettre en file d'attente",
                pt: "Colocar em fila",
              })
            : t3({
                en: "Start import",
                fr: "Démarrer l'importation",
                pt: "Iniciar a importação",
              })}
        </Button>
      </div>
    </div>
  );
}
