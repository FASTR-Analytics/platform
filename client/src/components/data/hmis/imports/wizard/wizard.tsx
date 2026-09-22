import {
  describeDhis2Selection,
  getCalendar,
  NO_STORED_DHIS2_CONNECTION,
  POPULATION_TYPE_IDS,
  t3,
  type DatasetHmisScheduledImport,
  type DatasetHmisScheduledImportFields,
  type Dhis2RunPairInput,
  type Dhis2RunSelectionInput,
  type Dhis2ScheduleRecurrence,
  type Dhis2SelectionDescription,
  type HmisIndicator,
} from "lib";
import { recurrenceLabel } from "../_shared/mod.ts";
import {
  AlertComponentProps,
  ModalContainer,
  StepperChipsWithTitles,
  createFormAction,
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
import { Dhis2StepConfig } from "./step_3_config";
import { Dhis2StepIndicators } from "./step_1_indicators";
import { Dhis2StepReview } from "./step_4_review";
import { Dhis2StepTime, type Dhis2WizardTimeChoice } from "./step_2_time";

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

type StepKind = "indicators" | "time" | "config" | "review";

const FULL_STEPS: StepKind[] = ["indicators", "time", "config", "review"];
const PRESET_STEPS: StepKind[] = ["time", "review"];

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
// reads what it needs itself, so the imports view and the indicator manager
// hand it the entry and nothing else.
export function Dhis2Wizard(
  p: AlertComponentProps<Dhis2WizardProps, Dhis2WizardResult>,
) {
  return (
    <Show
      when={instanceState.dhis2ConnectionUrl}
      fallback={
        <ModalContainer
          width="md"
          title={t3(DHIS2_DATA_IMPORT_TITLE)}
          onCancel={() => p.close(undefined)}
          cancelLabel={t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        >
          <div class="text-danger">{t3(NO_STORED_DHIS2_CONNECTION)}</div>
        </ModalContainer>
      }
    >
      <Dhis2WizardInner entry={p.entry} close={p.close} />
    </Show>
  );
}

type InnerProps = {
  entry: Dhis2WizardEntry;
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

  // Indicators step. The dictionary the picker loads lets the wizard
  // describe what the selection expands to (the DHIS2 elements fetched and
  // the parts dropped) with the same lib expansion the server persists at
  // launch; the step refuses Next while nothing would be fetched or a
  // calculated does not resolve (PLAN_A7 rulings 3 and 5).
  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>(
    p.entry.kind === "new"
      ? (p.entry.indicatorIds ?? [])
      : (scheduleDefaults?.selection.indicatorIds ?? []),
  );
  const [dictionary, setDictionary] = createSignal<HmisIndicator[] | undefined>(
    undefined,
  );
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
        en: "A selected calculated indicator's formula does not resolve:",
        fr: "La formule d'un indicateur calculé sélectionné ne se résout pas :",
        pt: "A fórmula de um indicador calculado selecionado não se resolve:",
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

  // Time step.
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
  const [recurKind, setRecurKind] = createSignal<
    Dhis2ScheduleRecurrence["kind"]
  >(recurrenceDefaults?.kind ?? "weekly");
  const [firstRunDate, setFirstRunDate] = createSignal<string>(
    recurrenceDefaults?.kind === "weekly"
      ? recurrenceDefaults.firstRunDate
      : "",
  );
  const [everyNWeeks, setEveryNWeeks] = createSignal<string>(
    recurrenceDefaults?.kind === "weekly"
      ? String(recurrenceDefaults.everyNWeeks)
      : "1",
  );
  const [nth, setNth] = createSignal<string>(
    recurrenceDefaults?.kind === "monthly"
      ? String(recurrenceDefaults.nth)
      : "1",
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

  // Config step.
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
      nth:
        nth() === "last" ? "last" : ((parseInt(nth()) || 1) as 1 | 2 | 3 | 4),
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

  // Live run state from the SSE summary, which the server pushes at launch,
  // enqueue, scheduler fire and completion: read here (never a snapshot
  // captured at open) so the Start-vs-Queue fork is honest at both render
  // and submit time, in every host.
  const runActive = () => instanceState.hmisImportRunActive;
  const isImmediateFlow = () => isPreset || timeChoice() === "now";
  const willQueue = createMemo(() => isImmediateFlow() && runActive());

  const connectionSummary = () => instanceState.dhis2ConnectionUrl ?? "";

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
    return await serverActions.launchDatasetHmisDhis2Run({ selection });
  }

  const submit = createFormAction(
    async () => {
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
      height="lg"
      width="3xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">{t3(DHIS2_DATA_IMPORT_TITLE)}</div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      onCancel={() => p.close(undefined)}
      actions={[
        ...(stepper.currentStep() > 0
          ? [
              {
                label: t3({ en: "Back", fr: "Retour", pt: "Voltar" }),
                onClick: stepper.goPrev,
                outline: true,
              },
            ]
          : []),
        ...(isLastStep()
          ? [
              {
                label: ctaLabel(),
                onClick: submit.click,
                state: submit.state(),
              },
            ]
          : [
              {
                label: t3({ en: "Next", fr: "Suivant", pt: "Seguinte" }),
                onClick: stepper.goNext,
                disabled: !stepper.canGoNext(),
              },
            ]),
      ]}
    >
      <div class="ui-pad min-h-[24rem]">
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
          />
        </Show>
      </div>
    </ModalContainer>
  );
}
