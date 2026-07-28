import { t3, type Dhis2ScheduleRecurrence } from "lib";
import {
  Button,
  DateInput,
  MonthSelect,
  RadioGroup,
  Select,
  TimeInput,
  TimezoneSelect,
  YearSelect,
  ZonedDateTimeInput,
  type SelectOption,
  type ZonedDateTime,
} from "panther";
import { Match, Show, Switch } from "solid-js";
import { dayOfWeekLabel, weekdayOfWallDate } from "../_recurrence_label";

export type Dhis2WizardTimeChoice = "now" | "later" | "recurring";

type Props = {
  // presetPairs launches (checklist "re-import"/"retry failed") are always
  // Now-or-Queue — a fixed one-off pair list is not sensibly schedulable, so
  // no radio is shown at all.
  presetMode: boolean;
  timeChoice: () => Dhis2WizardTimeChoice;
  setTimeChoice: (v: Dhis2WizardTimeChoice) => void;
  runAtZoned: () => ZonedDateTime;
  setRunAtZoned: (v: ZonedDateTime) => void;
  recurKind: () => Dhis2ScheduleRecurrence["kind"];
  setRecurKind: (v: Dhis2ScheduleRecurrence["kind"]) => void;
  firstRunDate: () => string;
  setFirstRunDate: (v: string) => void;
  everyNWeeks: () => string;
  setEveryNWeeks: (v: string) => void;
  nth: () => string;
  setNth: (v: string) => void;
  monthlyWeekday: () => string;
  setMonthlyWeekday: (v: string) => void;
  everyNMonths: () => string;
  setEveryNMonths: (v: string) => void;
  anchorMonth: () => string;
  setAnchorMonth: (v: string) => void;
  startTime: () => string;
  setStartTime: (v: string) => void;
  timezone: () => string;
  setTimezone: (v: string) => void;
  // Scheduling needs stored credentials (server's assertUnattendedReady).
  // gateApplies mirrors the server's actual check scope: always for a new
  // schedule, but for an EDIT only when the (possibly just-changed) kind is
  // "later" — updateDatasetHmisDhis2Schedule doesn't re-check an existing
  // recurring schedule's edit (see _wizard/index.tsx computeTimeValid).
  gateApplies: boolean;
  hasStoredCredentials: boolean;
  onBackToCredentials: () => void;
};

export function Dhis2StepTime(p: Props) {
  const timeOptions: SelectOption<Dhis2WizardTimeChoice>[] = [
    { value: "now", label: t3({ en: "Now", fr: "Maintenant", pt: "Agora" }) },
    {
      value: "later",
      label: t3({ en: "Once, at a set time", fr: "Une fois, à une heure donnée", pt: "Uma vez, a uma hora definida" }),
    },
    {
      value: "recurring",
      label: t3({ en: "Recurring", fr: "Récurrente", pt: "Recorrente" }),
    },
  ];

  const recurKindOptions: SelectOption<Dhis2ScheduleRecurrence["kind"]>[] = [
    { value: "daily", label: t3({ en: "Daily", fr: "Chaque jour", pt: "Diariamente" }) },
    { value: "weekly", label: t3({ en: "Weekly", fr: "Hebdomadaire", pt: "Semanal" }) },
    { value: "monthly", label: t3({ en: "Monthly", fr: "Mensuelle", pt: "Mensal" }) },
  ];

  const dayOptions: SelectOption<string>[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    value: String(d),
    label: dayOfWeekLabel(d),
  }));

  const weeklyIntervalOptions: SelectOption<string>[] = [1, 2, 4].map((w) => ({
    value: String(w),
    label:
      w === 1
        ? t3({ en: "Every week", fr: "Chaque semaine", pt: "Todas as semanas" })
        : `${t3({ en: "Every", fr: "Toutes les", pt: "A cada" })} ${w} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })}`,
  }));

  const nthOptions: SelectOption<string>[] = [
    { value: "1", label: t3({ en: "First", fr: "Premier", pt: "Primeiro" }) },
    { value: "2", label: t3({ en: "Second", fr: "Deuxième", pt: "Segundo" }) },
    { value: "3", label: t3({ en: "Third", fr: "Troisième", pt: "Terceiro" }) },
    { value: "4", label: t3({ en: "Fourth", fr: "Quatrième", pt: "Quarto" }) },
    { value: "last", label: t3({ en: "Last", fr: "Dernier", pt: "Último" }) },
  ];

  const monthlyIntervalOptions: SelectOption<string>[] = [
    { value: "1", label: t3({ en: "Every month", fr: "Chaque mois", pt: "Todos os meses" }) },
    { value: "3", label: t3({ en: "Every 3 months", fr: "Tous les 3 mois", pt: "A cada 3 meses" }) },
  ];

  const derivedWeekday = () =>
    p.firstRunDate() === ""
      ? undefined
      : dayOfWeekLabel(weekdayOfWallDate(p.firstRunDate()));

  const needsUnattendedGate = () =>
    (p.timeChoice() === "later" || p.timeChoice() === "recurring") && p.gateApplies;

  return (
    <div class="ui-spy">
      <Show
        when={!p.presetMode}
        fallback={
          <div class="text-sm">
            {t3({
              en: "This will run now (or be queued to start after the current import finishes).",
              fr: "Cette action démarrera maintenant (ou sera mise en file d'attente si une importation est en cours).",
              pt: "Isto será executado agora (ou colocado em fila até a importação atual terminar).",
            })}
          </div>
        }
      >
        <RadioGroup
          value={p.timeChoice()}
          options={timeOptions}
          onChange={p.setTimeChoice}
        />

        <Switch>
          <Match when={p.timeChoice() === "later"}>
            <ZonedDateTimeInput
              value={p.runAtZoned()}
              onChange={p.setRunAtZoned}
              dateTimeLabel={t3({ en: "Run at", fr: "Exécuter le", pt: "Executar em" })}
              timezoneLabel={t3({ en: "Timezone", fr: "Fuseau horaire", pt: "Fuso horário" })}
            />
          </Match>
          <Match when={p.timeChoice() === "recurring"}>
            <div class="ui-gap flex flex-wrap items-end">
              <Select
                label={t3({ en: "Repeats", fr: "Répétition", pt: "Repetição" })}
                value={p.recurKind()}
                options={recurKindOptions}
                onChange={p.setRecurKind}
              />
              <Show when={p.recurKind() === "weekly"}>
                <DateInput
                  label={t3({ en: "First run on", fr: "Première exécution le", pt: "Primeira execução em" })}
                  value={p.firstRunDate()}
                  onChange={p.setFirstRunDate}
                />
                <Select
                  label={t3({ en: "Interval", fr: "Intervalle", pt: "Intervalo" })}
                  value={p.everyNWeeks()}
                  options={weeklyIntervalOptions}
                  onChange={p.setEveryNWeeks}
                />
              </Show>
              <Show when={p.recurKind() === "monthly"}>
                <Select
                  label={t3({ en: "Which", fr: "Lequel", pt: "Qual" })}
                  value={p.nth()}
                  options={nthOptions}
                  onChange={p.setNth}
                />
                <Select
                  label={t3({ en: "Day of week", fr: "Jour de la semaine", pt: "Dia da semana" })}
                  value={p.monthlyWeekday()}
                  options={dayOptions}
                  onChange={p.setMonthlyWeekday}
                />
                <Select
                  label={t3({ en: "Interval", fr: "Intervalle", pt: "Intervalo" })}
                  value={p.everyNMonths()}
                  options={monthlyIntervalOptions}
                  onChange={p.setEveryNMonths}
                />
              </Show>
              <TimeInput
                label={t3({ en: "Start time", fr: "Heure de début", pt: "Hora de início" })}
                value={p.startTime()}
                onChange={p.setStartTime}
              />
              <TimezoneSelect
                label={t3({ en: "Timezone", fr: "Fuseau horaire", pt: "Fuso horário" })}
                value={p.timezone()}
                onChange={p.setTimezone}
              />
            </div>
            <Show when={p.recurKind() === "monthly" && p.everyNMonths() === "3"}>
              <div class="ui-gap flex flex-wrap items-end">
                <MonthSelect
                  label={t3({ en: "Starting month", fr: "Mois de départ", pt: "Mês de início" })}
                  value={p.anchorMonth().split("-")[1] ?? "01"}
                  onChange={(mm) =>
                    p.setAnchorMonth(`${p.anchorMonth().split("-")[0]}-${mm}`)
                  }
                />
                <YearSelect
                  label={t3({ en: "Starting year", fr: "Année de départ", pt: "Ano de início" })}
                  value={p.anchorMonth().split("-")[0] ?? ""}
                  onChange={(yyyy) =>
                    p.setAnchorMonth(`${yyyy}-${p.anchorMonth().split("-")[1] ?? "01"}`)
                  }
                />
              </div>
            </Show>
            <Show when={p.recurKind() === "weekly" && derivedWeekday()}>
              <div class="text-xs">
                {t3({ en: "Runs every", fr: "S'exécute chaque", pt: "Executa todas as" })}{" "}
                {derivedWeekday()}
                {p.everyNWeeks() !== "1"
                  ? ` (${t3({ en: "every", fr: "toutes les", pt: "a cada" })} ${p.everyNWeeks()} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })})`
                  : ""}
              </div>
            </Show>
            <div class="text-xs">
              {t3({
                en: "Pick a low-traffic window for the DHIS2 server. For Nigeria, ~01:15 Africa/Lagos (just after the nightly analytics rebuild) works well.",
                fr: "Choisissez une fenêtre de faible trafic pour le serveur DHIS2. Pour le Nigeria, ~01:15 Africa/Lagos (juste après la reconstruction nocturne des tables analytics) convient bien.",
                pt: "Escolha uma janela de baixo tráfego para o servidor DHIS2. Para a Nigéria, ~01:15 Africa/Lagos (logo após a reconstrução noturna das tabelas analytics) funciona bem.",
              })}
            </div>
          </Match>
        </Switch>

        <Show when={needsUnattendedGate() && !p.hasStoredCredentials}>
          <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border text-sm">
            {t3({
              en: "A future or recurring import needs stored DHIS2 credentials — save them in step 1 first.",
              fr: "Une importation future ou récurrente nécessite des identifiants DHIS2 enregistrés — enregistrez-les d'abord à l'étape 1.",
              pt: "Uma importação futura ou recorrente requer credenciais DHIS2 guardadas — guarde-as primeiro no passo 1.",
            })}
            <Button onClick={p.onBackToCredentials} intent="danger" size="sm">
              {t3({ en: "Back to step 1", fr: "Retour à l'étape 1", pt: "Voltar ao passo 1" })}
            </Button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
