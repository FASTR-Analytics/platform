import {
  describeDhis2Selection,
  getCalendar,
  POPULATION_TYPE_IDS,
  t3,
  type DatasetHmisScheduledImport,
  type DatasetHmisScheduledImportFields,
  type Dhis2Credentials,
  type Dhis2RunPairInput,
  type Dhis2RunSelectionInput,
  type Dhis2ScheduleRecurrence,
  type Dhis2SelectionDescription,
  type HmisIndicator,
  type InstanceDhis2CredentialsInfo,
} from "lib";
import { recurrenceLabel } from "../_recurrence_label";
import {
  AlertComponentProps,
  Button,
  LoadingIndicator,
  ModalContainer,
  StateHolderFormError,
  StateHolderWrapper,
  StepperChipsWithTitles,
  createFormAction,
  createQuery,
  getLocalTimezone,
  getStepper,
  utcMsToZonedDateTime,
  zonedDateTimeToUtcIso,
  zonedDateTimeToUtcMs,
  type CalendarType,
  type ZonedDateTime,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { Dhis2StepConfig } from "./_step_config";
import { Dhis2StepCredentials } from "~/components/_shared/dhis2_credentials/step_credentials";
import { Dhis2StepIndicators } from "./_step_indicators";
import { Dhis2StepReview } from "./_step_review";
import { Dhis2StepTime, type Dhis2WizardTimeChoice } from "./_step_time";

// `new` may carry a selection to preselect (the indicator manager's bulk
// action, PLAN_A7 ruling 12); the imports view passes none.
export type Dhis2WizardEntry =
  | { kind: "new"; indicatorIds?: string[] }
  | { kind: "editSchedule"; schedule: DatasetHmisScheduledImport }
  | { kind: "presetPairs"; pairs: Dhis2RunPairInput[]; label: string };

export type Dhis2WizardProps = { entry: Dhis2WizardEntry };

export type Dhis2WizardResult = { landedTab: "current" | "future" };

// The wizard's title, and the name of every action that opens it.
export const DHIS2_DATA_IMPORT_TITLE = {
  en: "Import HMIS data from DHIS2",
  fr: "Importer les données HMIS depuis DHIS2",
  pt: "Importar dados HMIS do DHIS2",
};

// Why a seeded id was left out of the selection when the dictionary loaded.
export type Dhis2SeedDrop = { id: string; reason: "uploaded" | "unknown" };

type StepKind = "credentials" | "indicators" | "time" | "config" | "review";

const FULL_STEPS: StepKind[] = [
  "credentials",
  "indicators",
  "time",
  "config",
  "review",
];
const PRESET_STEPS: StepKind[] = ["credentials", "time", "review"];

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
  let defaultStartYear = currentYear;
  let defaultStartMonth = currentMonth;
  if (currentMonth === 12) {
    defaultStartMonth = 1;
  } else {
    defaultStartYear = currentYear - 1;
    defaultStartMonth = currentMonth + 1;
  }
  const min = calendar === "ethiopian" ? 200501 : 201501;
  const defaultStart = Math.max(
    defaultStartYear * 100 + defaultStartMonth,
    min,
  );
  return { min, max: current, defaultStart, defaultEnd: current };
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// The one wizard for every way a DHIS2 import gets configured: ad hoc run,
// queue, one-shot future run, recurring schedule (PLAN_DHIS2_IMPORTER_UI_REVISION
// §3). A modal (Add-visualization pattern), not a full-screen editor: short,
// transient configure-and-submit, dismissed straight back to its host. It
// fetches what it needs itself (the results-package wizard's shape), so the
// imports view and the indicator manager hand it the entry and nothing else.
export function Dhis2Wizard(
  p: AlertComponentProps<Dhis2WizardProps, Dhis2WizardResult>,
) {
  const query = createQuery(
    () => serverActions.getInstanceDhis2CredentialsInfo({}),
    t3({
      en: "Loading DHIS2 connection...",
      fr: "Chargement de la connexion DHIS2...",
      pt: "A carregar a ligação DHIS2...",
    }),
  );
  return (
    <StateHolderWrapper
      state={query.state()}
      loadingRenderer={(msg) => (
        <ModalContainer width="2xl" title={t3(DHIS2_DATA_IMPORT_TITLE)}>
          <div class="min-h-[24rem]">
            <LoadingIndicator msg={msg} noPad />
          </div>
        </ModalContainer>
      )}
      errorRenderer={(err) => (
        <ModalContainer
          width="2xl"
          title={t3(DHIS2_DATA_IMPORT_TITLE)}
          rightButtons={
            <Button onClick={() => p.close(undefined)} outline>
              {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          }
        >
          <div class="text-danger">{err}</div>
        </ModalContainer>
      )}
    >
      {(info) => (
        <Dhis2WizardInner entry={p.entry} info={info} close={p.close} />
      )}
    </StateHolderWrapper>
  );
}

type InnerProps = {
  entry: Dhis2WizardEntry;
  info: InstanceDhis2CredentialsInfo;
  close: (v: Dhis2WizardResult | undefined) => void;
};

function Dhis2WizardInner(p: InnerProps) {
  const isPreset = p.entry.kind === "presetPairs";
  const isEditSchedule = p.entry.kind === "editSchedule";
  const scheduleDefaults =
    p.entry.kind === "editSchedule" ? p.entry.schedule : undefined;
  const steps = isPreset ? PRESET_STEPS : FULL_STEPS;

  const calendar = getCalendar();
  const periods = getMinMaxPeriods(calendar);

  // Step 1: credentials. The info is held here and refreshed by the step's
  // own save, never by refetching the outer query: the wrapper keys its
  // ready branch on the data object, and a remount would wipe the
  // selection of a user who came back through "Back to step 1".
  const [credentialsInfo, setCredentialsInfo] =
    createSignal<InstanceDhis2CredentialsInfo>(p.info);
  const [editingCreds, setEditingCreds] = createSignal<boolean>(
    !p.info.storedCredentials,
  );
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: p.info.storedCredentials?.url ?? "",
    username: "",
    password: "",
  });
  async function refreshCredentialsInfo() {
    const res = await serverActions.getInstanceDhis2CredentialsInfo({});
    if (res.success) setCredentialsInfo(res.data);
  }

  // Step 2: indicators. The dictionary the picker loads lets the wizard
  // describe what the selection expands to (the DHIS2 elements fetched and
  // the parts dropped) with the same lib expansion the server persists at
  // launch; the step refuses Next while nothing would be fetched or a
  // derived does not resolve (PLAN_A7 rulings 3 and 5).
  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>(
    p.entry.kind === "new"
      ? (p.entry.indicatorIds ?? [])
      : (scheduleDefaults?.selection.indicatorIds ?? []),
  );
  const [dictionary, setDictionary] = createSignal<
    HmisIndicator[] | undefined
  >(undefined);
  // A seeded selection (the manager's rows, a stored schedule) may name ids
  // the picker does not list: an Uploaded indicator, or one no longer in the
  // dictionary. They are dropped once, when the dictionary first arrives,
  // and the step says which and why (PLAN_A7 ruling 12).
  const [seedDrops, setSeedDrops] = createSignal<Dhis2SeedDrop[]>([]);
  let seedChecked = false;
  function handleDictionaryLoaded(loaded: HmisIndicator[]) {
    setDictionary(loaded);
    if (seedChecked) return;
    seedChecked = true;
    const byId = new Map(loaded.map((i) => [i.indicator_common_id, i]));
    const drops: Dhis2SeedDrop[] = [];
    const kept = selectedIndicators().filter((id) => {
      const indicator = byId.get(id);
      if (indicator === undefined) {
        drops.push({ id, reason: "unknown" });
        return false;
      }
      if (indicator.definition.type === "uploaded") {
        drops.push({ id, reason: "uploaded" });
        return false;
      }
      return true;
    });
    if (drops.length > 0) {
      setSelectedIndicators(kept);
      setSeedDrops(drops);
    }
  }
  const description = createMemo<Dhis2SelectionDescription | undefined>(() => {
    const d = dictionary();
    if (isPreset || d === undefined) return undefined;
    return describeDhis2Selection(selectedIndicators(), d, POPULATION_TYPE_IDS);
  });
  const indicatorsRefusal = createMemo<string | undefined>(() => {
    const d = description();
    if (d === undefined || selectedIndicators().length === 0) return undefined;
    if (d.unresolvable.length > 0) {
      return `${t3({
        en: "A selected derived indicator's formula does not resolve:",
        fr: "La formule d'un indicateur dérivé sélectionné ne se résout pas :",
        pt: "A fórmula de um indicador derivado selecionado não se resolve:",
      })} ${d.unresolvable.map((u) => `${u.id} (${u.problem})`).join("; ")}`;
    }
    if (d.elements.length === 0) {
      return t3({
        en: "The selected indicators have no DHIS2 elements to fetch.",
        fr: "Les indicateurs sélectionnés n'ont aucun élément DHIS2 à récupérer.",
        pt: "Os indicadores selecionados não têm elementos DHIS2 a obter.",
      });
    }
    return undefined;
  });

  // Step 3: time.
  const [timeChoice, setTimeChoice] = createSignal<Dhis2WizardTimeChoice>(
    isPreset
      ? "now"
      : scheduleDefaults?.kind === "one_shot"
        ? "later"
        : scheduleDefaults?.kind === "recurring"
          ? "recurring"
          : "now",
  );
  const [runAtZoned, setRunAtZoned] = createSignal<ZonedDateTime>(
    scheduleDefaults?.runAt
      ? utcMsToZonedDateTime(
          new Date(scheduleDefaults.runAt).getTime(),
          getLocalTimezone(),
        )
      : { dateTime: "", timezone: getLocalTimezone() },
  );
  const recurrenceDefaults = scheduleDefaults?.recurrence;
  const [recurKind, setRecurKind] = createSignal<Dhis2ScheduleRecurrence["kind"]>(
    recurrenceDefaults?.kind ?? "weekly",
  );
  const [firstRunDate, setFirstRunDate] = createSignal<string>(
    recurrenceDefaults?.kind === "weekly" ? recurrenceDefaults.firstRunDate : "",
  );
  const [everyNWeeks, setEveryNWeeks] = createSignal<string>(
    recurrenceDefaults?.kind === "weekly"
      ? String(recurrenceDefaults.everyNWeeks)
      : "1",
  );
  const [nth, setNth] = createSignal<string>(
    recurrenceDefaults?.kind === "monthly" ? String(recurrenceDefaults.nth) : "1",
  );
  const [monthlyWeekday, setMonthlyWeekday] = createSignal<string>(
    recurrenceDefaults?.kind === "monthly"
      ? String(recurrenceDefaults.weekday)
      : "1",
  );
  const [everyNMonths, setEveryNMonths] = createSignal<string>(
    recurrenceDefaults?.kind === "monthly"
      ? String(recurrenceDefaults.everyNMonths)
      : "1",
  );
  const [anchorMonth, setAnchorMonth] = createSignal<string>(
    recurrenceDefaults?.kind === "monthly"
      ? recurrenceDefaults.anchorMonth
      : currentYearMonth(),
  );
  const [startTime, setStartTime] = createSignal<string>(
    recurrenceDefaults?.startTime ?? "01:15",
  );
  const [timezone, setTimezone] = createSignal<string>(
    recurrenceDefaults?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  // Step 4: config.
  const [startPeriod, setStartPeriod] = createSignal<number>(
    scheduleDefaults?.selection.kind === "explicit_range"
      ? scheduleDefaults.selection.startPeriod
      : periods.defaultStart,
  );
  const [endPeriod, setEndPeriod] = createSignal<number>(
    scheduleDefaults?.selection.kind === "explicit_range"
      ? scheduleDefaults.selection.endPeriod
      : periods.defaultEnd,
  );
  const [monthsBack, setMonthsBack] = createSignal<number>(
    scheduleDefaults?.selection.kind === "last_n_months"
      ? scheduleDefaults.selection.monthsBack
      : 12,
  );

  const hasStoredCredentials = () =>
    credentialsInfo().storedCredentials !== undefined;

  // The stored-credentials gate applies whenever the server will actually
  // check it: createDatasetHmisDhis2Schedule always checks it (any kind), but
  // updateDatasetHmisDhis2Schedule only re-checks for kind "one_shot":
  // editing an existing recurring schedule's time/day is not a re-arm
  // gesture and isn't gated server-side (datasets.ts updateDatasetHmisDhis2Schedule).
  const gateApplies = () => !isEditSchedule || timeChoice() === "later";

  function buildRecurrence(): Dhis2ScheduleRecurrence {
    const base = { startTime: startTime(), timezone: timezone() };
    if (recurKind() === "daily") {
      return { kind: "daily", ...base };
    }
    if (recurKind() === "weekly") {
      return {
        kind: "weekly",
        firstRunDate: firstRunDate(),
        everyNWeeks: parseInt(everyNWeeks()) || 1,
        ...base,
      };
    }
    const nMonths = parseInt(everyNMonths()) || 1;
    return {
      kind: "monthly",
      nth: nth() === "last" ? "last" : ((parseInt(nth()) || 1) as 1 | 2 | 3 | 4),
      weekday: parseInt(monthlyWeekday()) || 0,
      everyNMonths: nMonths,
      // Phase is irrelevant at monthly cadence: any anchor gives the same
      // occurrences, so pin the current month rather than asking.
      anchorMonth: nMonths === 1 ? currentYearMonth() : anchorMonth(),
      ...base,
    };
  }

  function computeTimeValid(): boolean {
    if (timeChoice() === "now") return true;
    if (gateApplies() && !hasStoredCredentials()) return false;
    if (timeChoice() === "later") return runAtZoned().dateTime !== "";
    if (startTime() === "") return false;
    if (recurKind() === "weekly") return firstRunDate() !== "";
    return true;
  }

  function computeConfigValid(): boolean {
    if (timeChoice() === "recurring") return monthsBack() >= 1;
    return startPeriod() <= endPeriod();
  }

  const stepperData = createMemo(() => ({
    credsValid: editingCreds()
      ? credentials().url !== "" &&
        credentials().username !== "" &&
        credentials().password !== ""
      : true,
    indicatorsValid:
      selectedIndicators().length > 0 &&
      description() !== undefined &&
      indicatorsRefusal() === undefined,
    timeValid: computeTimeValid(),
    configValid: computeConfigValid(),
  }));

  const stepper = getStepper(stepperData, {
    initialStep: 0,
    minStep: 0,
    maxStep: steps.length - 1,
    getValidation: (step, data) => {
      const kind = steps[step];
      if (kind === "credentials")
        return { canGoPrev: false, canGoNext: data.credsValid };
      if (kind === "indicators")
        return { canGoPrev: true, canGoNext: data.indicatorsValid };
      if (kind === "time")
        return { canGoPrev: true, canGoNext: data.timeValid };
      if (kind === "config")
        return { canGoPrev: true, canGoNext: data.configValid };
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => steps[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  const STEP_LABEL: Record<StepKind, string> = {
    credentials: t3({
      en: "Credentials",
      fr: "Identifiants",
      pt: "Credenciais",
    }),
    indicators: t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" }),
    time: t3({ en: "Time", fr: "Heure", pt: "Hora" }),
    config: t3({ en: "Config", fr: "Configuration", pt: "Configuração" }),
    review: t3({
      en: "Review & launch",
      fr: "Vérifier et lancer",
      pt: "Rever e iniciar",
    }),
  };
  const stepLabels = steps.map((k) => STEP_LABEL[k]);

  const credentialsStepIndex = steps.indexOf("credentials");

  // Live run state from the SSE summary, which the server pushes at launch,
  // enqueue, scheduler fire and completion: read here (never a snapshot
  // captured at open) so the Start-vs-Queue fork is honest at both render
  // and submit time, in every host.
  const runActive = () => instanceState.hmisImportRunActive;
  const isImmediateFlow = () => isPreset || timeChoice() === "now";
  const willQueue = createMemo(() => isImmediateFlow() && runActive());
  // Queued fires always use the stored connection (enqueueDatasetHmisDhis2Run
  // never accepts inline credentials): resolving to Queue with unsaved
  // inline credentials can't proceed.
  const queueBlocked = createMemo(() => willQueue() && editingCreds());

  const connectionSummary = () => {
    if (editingCreds()) {
      return credentials().url
        ? `${t3({ en: "Inline (this run only):", fr: "En ligne (cette importation uniquement) :", pt: "Direta (apenas esta importação):" })} ${credentials().url}`
        : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
    const stored = credentialsInfo().storedCredentials;
    return stored
      ? `${t3({ en: "Stored:", fr: "Enregistrée :", pt: "Guardada:" })} ${stored.url}`
      : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
  };

  const timeSummary = () => {
    if (isPreset || timeChoice() === "now") {
      return t3({ en: "Now", fr: "Maintenant", pt: "Agora" });
    }
    if (timeChoice() === "later") {
      return runAtZoned().dateTime
        ? new Date(zonedDateTimeToUtcMs(runAtZoned())).toLocaleString()
        : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
    if (recurKind() === "weekly" && firstRunDate() === "") {
      return t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
    return recurrenceLabel(buildRecurrence());
  };

  const windowSummary = () => {
    if (isPreset) return p.entry.kind === "presetPairs" ? p.entry.label : "";
    if (timeChoice() !== "recurring") {
      return `${getNMonths(startPeriod(), endPeriod())} ${t3({ en: "months", fr: "mois", pt: "meses" })} (${startPeriod()}–${endPeriod()})`;
    }
    return `${t3({ en: "Last", fr: "Derniers", pt: "Últimos" })} ${monthsBack()} ${t3({ en: "months", fr: "mois", pt: "meses" })}`;
  };

  const nPairs = createMemo(() => {
    if (isPreset)
      return p.entry.kind === "presetPairs" ? p.entry.pairs.length : 0;
    if (timeChoice() === "recurring") return undefined;
    const d = description();
    if (d === undefined) return undefined;
    return d.elements.length * getNMonths(startPeriod(), endPeriod());
  });

  const queueNotice = () =>
    willQueue()
      ? t3({
          en: "An import is currently running — this will start after it finishes.",
          fr: "Une importation est en cours — celle-ci démarrera une fois terminée.",
          pt: "Há uma importação em curso — esta começará assim que terminar.",
        })
      : undefined;

  const queueBlockedReason = () =>
    queueBlocked()
      ? t3({
          en: "Queued imports always run with the stored connection — save one, or wait for the current import to finish and start immediately with inline credentials.",
          fr: "Les importations en file d'attente utilisent toujours la connexion enregistrée — enregistrez-en une, ou attendez la fin de l'importation en cours pour démarrer immédiatement avec des identifiants en ligne.",
          pt: "As importações em fila utilizam sempre a ligação guardada — guarde uma, ou aguarde que a importação atual termine para iniciar de imediato com credenciais diretas.",
        })
      : undefined;

  const ctaLabel = () => {
    if (isImmediateFlow()) {
      return willQueue()
        ? t3({
            en: "Queue import",
            fr: "Mettre en file d'attente",
            pt: "Colocar em fila",
          })
        : t3({
            en: "Start import",
            fr: "Démarrer l'importation",
            pt: "Iniciar a importação",
          });
    }
    return isEditSchedule
      ? t3({
          en: "Save schedule",
          fr: "Enregistrer la planification",
          pt: "Guardar agendamento",
        })
      : t3({
          en: "Schedule import",
          fr: "Planifier l'importation",
          pt: "Agendar importação",
        });
  };

  async function launchOrQueueNow(selection: Dhis2RunSelectionInput) {
    if (willQueue()) {
      return await serverActions.enqueueDatasetHmisDhis2Run({ selection });
    }
    if (!editingCreds()) {
      return await serverActions.launchDatasetHmisDhis2Run({ selection });
    }
    const creds = credentials();
    if (!creds.url || !creds.username || !creds.password) {
      return {
        success: false as const,
        err: t3({
          en: "All DHIS2 connection fields are required",
          fr: "Tous les champs de connexion DHIS2 sont requis",
          pt: "Todos os campos de ligação DHIS2 são obrigatórios",
        }),
      };
    }
    return await serverActions.launchDatasetHmisDhis2Run({
      credentials: creds,
      selection,
    });
  }

  const submit = createFormAction(
    async () => {
      if (queueBlocked()) {
        return { success: false, err: queueBlockedReason() ?? "" };
      }

      if (isPreset) {
        const pairs = p.entry.kind === "presetPairs" ? p.entry.pairs : [];
        return await launchOrQueueNow({ kind: "pairs", pairs });
      }

      if (timeChoice() === "now") {
        return await launchOrQueueNow({
          kind: "window",
          indicatorIds: selectedIndicators(),
          startPeriod: startPeriod(),
          endPeriod: endPeriod(),
        });
      }

      const fields: DatasetHmisScheduledImportFields = {
        kind: timeChoice() === "later" ? "one_shot" : "recurring",
        selection:
          timeChoice() === "later"
            ? {
                kind: "explicit_range",
                indicatorIds: selectedIndicators(),
                startPeriod: startPeriod(),
                endPeriod: endPeriod(),
              }
            : {
                kind: "last_n_months",
                indicatorIds: selectedIndicators(),
                monthsBack: monthsBack(),
              },
      };
      if (timeChoice() === "later") {
        fields.runAt = zonedDateTimeToUtcIso(runAtZoned());
      } else {
        fields.recurrence = buildRecurrence();
      }

      return isEditSchedule && scheduleDefaults
        ? await serverActions.updateDatasetHmisDhis2Schedule({
            id: scheduleDefaults.id,
            schedule: fields,
          })
        : await serverActions.createDatasetHmisDhis2Schedule({
            schedule: fields,
          });
    },
    async () => {
      p.close({ landedTab: isImmediateFlow() ? "current" : "future" });
    },
  );

  return (
    <ModalContainer
      width="2xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">{t3(DHIS2_DATA_IMPORT_TITLE)}</div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button onClick={stepper.goPrev} outline>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={stepper.goNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={submit.click}
              disabled={queueBlocked()}
              state={submit.state()}
              intent="success"
            >
              {ctaLabel()}
            </Button>
          </Show>
        </>
      }
    >
      <div class="ui-pad min-h-[24rem]">
        <Show when={currentStepKind() === "credentials"}>
          <Dhis2StepCredentials
            storedCredentials={credentialsInfo().storedCredentials}
            encryptionKeyConfigured={credentialsInfo().encryptionKeyConfigured}
            editing={editingCreds}
            setEditing={setEditingCreds}
            credentials={credentials}
            setCredentials={setCredentials}
            onSaved={refreshCredentialsInfo}
            unsavedEditorHint={t3({
              en: "You can also continue without saving — these credentials will only be used for this run.",
              fr: "Vous pouvez aussi continuer sans enregistrer — ces identifiants ne seront utilisés que pour cette importation.",
              pt: "Também pode continuar sem guardar — estas credenciais serão utilizadas apenas para esta importação.",
            })}
          />
        </Show>
        <Show when={currentStepKind() === "indicators"}>
          <Dhis2StepIndicators
            selectedIds={selectedIndicators}
            setSelectedIds={setSelectedIndicators}
            onDictionaryLoaded={handleDictionaryLoaded}
            seedDrops={seedDrops()}
            refusal={indicatorsRefusal()}
          />
        </Show>
        <Show when={currentStepKind() === "time"}>
          <Dhis2StepTime
            presetMode={isPreset}
            timeChoice={timeChoice}
            setTimeChoice={setTimeChoice}
            runAtZoned={runAtZoned}
            setRunAtZoned={setRunAtZoned}
            recurKind={recurKind}
            setRecurKind={setRecurKind}
            firstRunDate={firstRunDate}
            setFirstRunDate={setFirstRunDate}
            everyNWeeks={everyNWeeks}
            setEveryNWeeks={setEveryNWeeks}
            nth={nth}
            setNth={setNth}
            monthlyWeekday={monthlyWeekday}
            setMonthlyWeekday={setMonthlyWeekday}
            everyNMonths={everyNMonths}
            setEveryNMonths={setEveryNMonths}
            anchorMonth={anchorMonth}
            setAnchorMonth={setAnchorMonth}
            startTime={startTime}
            setStartTime={setStartTime}
            timezone={timezone}
            setTimezone={setTimezone}
            gateApplies={gateApplies()}
            hasStoredCredentials={hasStoredCredentials()}
            onBackToCredentials={() =>
              stepper.setCurrentStep(credentialsStepIndex)
            }
          />
        </Show>
        <Show when={currentStepKind() === "config"}>
          <Dhis2StepConfig
            timeChoice={timeChoice()}
            periodMin={periods.min}
            periodMax={periods.max}
            startPeriod={startPeriod}
            setStartPeriod={setStartPeriod}
            endPeriod={endPeriod}
            setEndPeriod={setEndPeriod}
            monthsBack={monthsBack}
            setMonthsBack={setMonthsBack}
          />
        </Show>
        <Show when={currentStepKind() === "review"}>
          <Dhis2StepReview
            connectionSummary={connectionSummary()}
            nIndicators={isPreset ? undefined : selectedIndicators().length}
            description={description()}
            timeSummary={timeSummary()}
            windowSummary={windowSummary()}
            nPairs={nPairs()}
            queueNotice={queueNotice()}
            queueBlockedReason={queueBlockedReason()}
            onBackToCredentials={() =>
              stepper.setCurrentStep(credentialsStepIndex)
            }
          />
          <StateHolderFormError state={submit.state()} />
        </Show>
      </div>
    </ModalContainer>
  );
}
