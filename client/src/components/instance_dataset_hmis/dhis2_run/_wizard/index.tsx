import {
  getCalendar,
  t3,
  type DatasetHmisImportRunSummary,
  type DatasetHmisScheduledImport,
  type DatasetHmisScheduledImportFields,
  type Dhis2Credentials,
  type Dhis2ImportSchedulingInfo,
  type Dhis2RunPair,
  type Dhis2RunSelection,
} from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  Query,
  StateHolderFormError,
  StepperChipsWithTitles,
  createFormAction,
  getStepper,
  type CalendarType,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2StepConfig } from "./_step_config";
import { Dhis2StepCredentials } from "./_step_credentials";
import { Dhis2StepIndicators } from "./_step_indicators";
import { Dhis2StepReview } from "./_step_review";
import { Dhis2StepTime, type Dhis2WizardTimeChoice } from "./_step_time";

export type Dhis2WizardEntry =
  | { kind: "new" }
  | { kind: "editSchedule"; schedule: DatasetHmisScheduledImport }
  | { kind: "presetPairs"; pairs: Dhis2RunPair[]; label: string };

export type Dhis2WizardProps = {
  entry: Dhis2WizardEntry;
  runsQuery: Query<DatasetHmisImportRunSummary[]>;
  schedulingQuery: Query<Dhis2ImportSchedulingInfo>;
};

export type Dhis2WizardResult = { landedTab: "current" | "future" };

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

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The one wizard for every way a DHIS2 import gets configured — ad hoc run,
// queue, one-shot future run, recurring schedule (PLAN_DHIS2_IMPORTER_UI_REVISION
// §3). A modal (Add-visualization pattern), not a full-screen editor: short,
// transient configure-and-submit, opened from the imports listing and
// dismissed straight back to it.
export function Dhis2Wizard(
  p: AlertComponentProps<Dhis2WizardProps, Dhis2WizardResult>,
) {
  const isPreset = p.entry.kind === "presetPairs";
  const isEditSchedule = p.entry.kind === "editSchedule";
  const scheduleDefaults =
    p.entry.kind === "editSchedule" ? p.entry.schedule : undefined;
  const steps = isPreset ? PRESET_STEPS : FULL_STEPS;

  const calendar = getCalendar();
  const periods = getMinMaxPeriods(calendar);

  function schedulingData(): Dhis2ImportSchedulingInfo | undefined {
    const s = p.schedulingQuery.state();
    return s.status === "ready" ? s.data : undefined;
  }

  // Step 1 — credentials.
  const [editingCreds, setEditingCreds] = createSignal<boolean>(
    !schedulingData()?.storedCredentials,
  );
  const [credentials, setCredentials] = createSignal<Dhis2Credentials>({
    url: schedulingData()?.storedCredentials?.url ?? "",
    username: "",
    password: "",
  });

  // Step 2 — indicators.
  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>(
    scheduleDefaults?.selection.rawIndicatorIds ?? [],
  );

  // Step 3 — time.
  const [timeChoice, setTimeChoice] = createSignal<Dhis2WizardTimeChoice>(
    isPreset
      ? "now"
      : scheduleDefaults?.kind === "one_shot"
        ? "later"
        : scheduleDefaults?.kind === "recurring"
          ? "recurring"
          : "now",
  );
  const [runAtLocal, setRunAtLocal] = createSignal<string>(
    scheduleDefaults?.runAt ? toDatetimeLocalValue(scheduleDefaults.runAt) : "",
  );
  const [dayOfWeek, setDayOfWeek] = createSignal<string>(
    String(scheduleDefaults?.dayOfWeek ?? 1),
  );
  const [startTime, setStartTime] = createSignal<string>(
    scheduleDefaults?.startTime ?? "01:15",
  );
  const [timezone, setTimezone] = createSignal<string>(
    scheduleDefaults?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [intervalWeeks, setIntervalWeeks] = createSignal<string>(
    String(scheduleDefaults?.intervalWeeks ?? 1),
  );

  // Step 4 — config.
  const [startPeriod, setStartPeriod] = createSignal<number>(
    periods.defaultStart,
  );
  const [endPeriod, setEndPeriod] = createSignal<number>(periods.defaultEnd);
  const [monthsBack, setMonthsBack] = createSignal<string>(
    String(scheduleDefaults?.selection.monthsBack ?? 12),
  );

  const unattendedReady = () => schedulingData()?.unattendedReady ?? false;
  const hasStoredCredentials = () =>
    schedulingData()?.storedCredentials !== undefined;

  // The unattended gate applies whenever the server will actually check it:
  // createDatasetHmisDhis2Schedule always checks it (any kind), but
  // updateDatasetHmisDhis2Schedule only re-checks for kind "one_shot" —
  // editing an existing recurring schedule's time/day is not a re-arm
  // gesture and isn't gated server-side (datasets.ts updateDatasetHmisDhis2Schedule).
  const gateApplies = () => !isEditSchedule || timeChoice() === "later";

  function computeTimeValid(): boolean {
    if (timeChoice() === "now") return true;
    if (gateApplies() && !unattendedReady()) return false;
    if (timeChoice() === "later") return runAtLocal() !== "";
    return true;
  }

  function computeConfigValid(): boolean {
    if (timeChoice() === "now") return startPeriod() <= endPeriod();
    const n = parseInt(monthsBack());
    return !isNaN(n) && n >= 0;
  }

  const stepperData = createMemo(() => ({
    credsValid: editingCreds()
      ? credentials().url !== "" &&
        credentials().username !== "" &&
        credentials().password !== ""
      : true,
    indicatorsValid: selectedIndicators().length > 0,
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

  // Live run state — the shell's own 2 s poll keeps runsQuery.state() fresh;
  // reading it here (never a snapshot captured at open) is what makes the
  // Start-vs-Queue fork honest at both render and submit time.
  const runActive = createMemo(() => {
    const s = p.runsQuery.state();
    return s.status === "ready" && s.data.some((r) => r.status === "running");
  });
  const isImmediateFlow = () => isPreset || timeChoice() === "now";
  const willQueue = createMemo(() => isImmediateFlow() && runActive());
  // Queued fires always use the stored connection (enqueueDatasetHmisDhis2Run
  // never accepts inline credentials) — resolving to Queue with unsaved
  // inline credentials can't proceed.
  const queueBlocked = createMemo(() => willQueue() && editingCreds());

  const connectionSummary = () => {
    if (editingCreds()) {
      return credentials().url
        ? `${t3({ en: "Inline (this run only):", fr: "En ligne (cette importation uniquement) :", pt: "Direta (apenas esta importação):" })} ${credentials().url}`
        : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
    const stored = schedulingData()?.storedCredentials;
    return stored
      ? `${t3({ en: "Stored:", fr: "Enregistrée :", pt: "Guardada:" })} ${stored.url} — ${stored.username}`
      : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
  };

  const timeSummary = () => {
    if (isPreset || timeChoice() === "now") {
      return t3({ en: "Now", fr: "Maintenant", pt: "Agora" });
    }
    if (timeChoice() === "later") {
      return runAtLocal()
        ? new Date(runAtLocal()).toLocaleString()
        : t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
    const every =
      (parseInt(intervalWeeks()) || 1) === 1
        ? t3({ en: "weekly", fr: "chaque semaine", pt: "semanalmente" })
        : `${t3({ en: "every", fr: "toutes les", pt: "a cada" })} ${intervalWeeks()} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })}`;
    const days = [
      t3({ en: "Sunday", fr: "Dimanche", pt: "Domingo" }),
      t3({ en: "Monday", fr: "Lundi", pt: "Segunda-feira" }),
      t3({ en: "Tuesday", fr: "Mardi", pt: "Terça-feira" }),
      t3({ en: "Wednesday", fr: "Mercredi", pt: "Quarta-feira" }),
      t3({ en: "Thursday", fr: "Jeudi", pt: "Quinta-feira" }),
      t3({ en: "Friday", fr: "Vendredi", pt: "Sexta-feira" }),
      t3({ en: "Saturday", fr: "Samedi", pt: "Sábado" }),
    ];
    return `${days[parseInt(dayOfWeek())] ?? ""} ${startTime()} (${timezone()}), ${every}`;
  };

  const windowSummary = () => {
    if (isPreset) return p.entry.kind === "presetPairs" ? p.entry.label : "";
    if (timeChoice() === "now") {
      return `${getNMonths(startPeriod(), endPeriod())} ${t3({ en: "months", fr: "mois", pt: "meses" })} (${startPeriod()}–${endPeriod()})`;
    }
    return `${t3({ en: "current + previous", fr: "mois courant + précédents", pt: "mês atual + anteriores" })} ${monthsBack()} ${t3({ en: "months", fr: "mois", pt: "meses" })}`;
  };

  const nPairs = createMemo(() => {
    if (isPreset)
      return p.entry.kind === "presetPairs" ? p.entry.pairs.length : 0;
    if (timeChoice() !== "now") return undefined;
    return selectedIndicators().length * getNMonths(startPeriod(), endPeriod());
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

  async function launchOrQueueNow(selection: Dhis2RunSelection) {
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
          rawIndicatorIds: selectedIndicators(),
          startPeriod: startPeriod(),
          endPeriod: endPeriod(),
        });
      }

      const months = parseInt(monthsBack());
      const fields: DatasetHmisScheduledImportFields = {
        kind: timeChoice() === "later" ? "one_shot" : "recurring",
        selection: {
          rawIndicatorIds: selectedIndicators(),
          monthsBack: months,
        },
      };
      if (timeChoice() === "later") {
        fields.runAt = new Date(runAtLocal()).toISOString();
      } else {
        fields.dayOfWeek = parseInt(dayOfWeek());
        fields.startTime = startTime();
        fields.timezone = timezone();
        fields.intervalWeeks = parseInt(intervalWeeks());
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
      await p.runsQuery.silentFetch();
      await p.schedulingQuery.silentFetch();
      p.close({ landedTab: isImmediateFlow() ? "current" : "future" });
    },
  );

  return (
    <ModalContainer
      width="2xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({
              en: "Import from DHIS2",
              fr: "Importation depuis DHIS2",
              pt: "Importação a partir do DHIS2",
            })}
          </div>
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
            storedCredentials={schedulingData()?.storedCredentials}
            encryptionKeyConfigured={
              schedulingData()?.encryptionKeyConfigured ?? true
            }
            editing={editingCreds}
            setEditing={setEditingCreds}
            credentials={credentials}
            setCredentials={setCredentials}
            onSaved={async () => {
              await p.schedulingQuery.silentFetch();
            }}
          />
        </Show>
        <Show when={currentStepKind() === "indicators"}>
          <Dhis2StepIndicators
            selectedIds={selectedIndicators}
            setSelectedIds={setSelectedIndicators}
          />
        </Show>
        <Show when={currentStepKind() === "time"}>
          <Dhis2StepTime
            presetMode={isPreset}
            timeChoice={timeChoice}
            setTimeChoice={setTimeChoice}
            runAtLocal={runAtLocal}
            setRunAtLocal={setRunAtLocal}
            dayOfWeek={dayOfWeek}
            setDayOfWeek={setDayOfWeek}
            startTime={startTime}
            setStartTime={setStartTime}
            timezone={timezone}
            setTimezone={setTimezone}
            intervalWeeks={intervalWeeks}
            setIntervalWeeks={setIntervalWeeks}
            gateApplies={gateApplies()}
            hasStoredCredentials={hasStoredCredentials()}
            unattendedReady={unattendedReady()}
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
