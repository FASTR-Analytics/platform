import { t3 } from "lib";
import {
  Button,
  RadioGroup,
  Select,
  TimeInput,
  TimezoneSelect,
  ZonedDateTimeInput,
  type SelectOption,
  type ZonedDateTime,
} from "panther";
import { Match, Show, Switch } from "solid-js";

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
  dayOfWeek: () => string;
  setDayOfWeek: (v: string) => void;
  startTime: () => string;
  setStartTime: (v: string) => void;
  timezone: () => string;
  setTimezone: (v: string) => void;
  intervalWeeks: () => string;
  setIntervalWeeks: (v: string) => void;
  // The unattended gate (server's assertUnattendedReady) has two halves:
  // stored credentials AND a shadow-verified import against the stored URL.
  // gateApplies mirrors the server's actual check scope: always for a new
  // schedule, but for an EDIT only when the (possibly just-changed) kind is
  // "later" — updateDatasetHmisDhis2Schedule doesn't re-check an existing
  // recurring schedule's edit (see _wizard/index.tsx computeTimeValid).
  gateApplies: boolean;
  hasStoredCredentials: boolean;
  unattendedReady: boolean;
  onBackToCredentials: () => void;
};

function dayOfWeekLabel(day: number): string {
  const labels = [
    t3({ en: "Sunday", fr: "Dimanche", pt: "Domingo" }),
    t3({ en: "Monday", fr: "Lundi", pt: "Segunda-feira" }),
    t3({ en: "Tuesday", fr: "Mardi", pt: "Terça-feira" }),
    t3({ en: "Wednesday", fr: "Mercredi", pt: "Quarta-feira" }),
    t3({ en: "Thursday", fr: "Jeudi", pt: "Quinta-feira" }),
    t3({ en: "Friday", fr: "Vendredi", pt: "Sexta-feira" }),
    t3({ en: "Saturday", fr: "Samedi", pt: "Sábado" }),
  ];
  return labels[day] ?? String(day);
}

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

  const dayOptions: SelectOption<string>[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    value: String(d),
    label: dayOfWeekLabel(d),
  }));

  const intervalOptions: SelectOption<string>[] = [1, 2, 4].map((w) => ({
    value: String(w),
    label:
      w === 1
        ? t3({ en: "Every week", fr: "Chaque semaine", pt: "Todas as semanas" })
        : `${t3({ en: "Every", fr: "Toutes les", pt: "A cada" })} ${w} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })}`,
  }));

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
                label={t3({ en: "Day of week", fr: "Jour de la semaine", pt: "Dia da semana" })}
                value={p.dayOfWeek()}
                options={dayOptions}
                onChange={p.setDayOfWeek}
              />
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
              <Select
                label={t3({ en: "Interval", fr: "Intervalle", pt: "Intervalo" })}
                value={p.intervalWeeks()}
                options={intervalOptions}
                onChange={p.setIntervalWeeks}
              />
            </div>
            <div class="text-xs">
              {t3({
                en: "Pick a low-traffic window for the DHIS2 server. For Nigeria, ~01:15 Africa/Lagos (just after the nightly analytics rebuild) works well.",
                fr: "Choisissez une fenêtre de faible trafic pour le serveur DHIS2. Pour le Nigeria, ~01:15 Africa/Lagos (juste après la reconstruction nocturne des tables analytics) convient bien.",
                pt: "Escolha uma janela de baixo tráfego para o servidor DHIS2. Para a Nigéria, ~01:15 Africa/Lagos (logo após a reconstrução noturna das tabelas analytics) funciona bem.",
              })}
            </div>
          </Match>
        </Switch>

        <Show when={needsUnattendedGate() && !p.unattendedReady}>
          <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border text-sm">
            <Switch>
              <Match when={!p.hasStoredCredentials}>
                {t3({
                  en: "A future or recurring import needs stored DHIS2 credentials — save them in step 1 first.",
                  fr: "Une importation future ou récurrente nécessite des identifiants DHIS2 enregistrés — enregistrez-les d'abord à l'étape 1.",
                  pt: "Uma importação futura ou recorrente requer credenciais DHIS2 guardadas — guarde-as primeiro no passo 1.",
                })}
              </Match>
              <Match when={true}>
                {t3({
                  en: "Scheduling unlocks after one import against the stored DHIS2 URL has verified cleanly (its first run cross-checks a sample against the analytics engine). Run an import directly first, then come back to schedule the rest.",
                  fr: "La planification se débloque après qu'une importation vers l'URL DHIS2 enregistrée a été vérifiée avec succès (la première importation compare un échantillon avec le moteur analytics). Lancez d'abord une importation directement, puis revenez planifier le reste.",
                  pt: "O agendamento é desbloqueado depois de uma importação para o URL DHIS2 guardado ter sido verificada com sucesso (a primeira importação compara uma amostra com o motor analytics). Execute primeiro uma importação diretamente e depois volte para agendar o resto.",
                })}
              </Match>
            </Switch>
            <Button onClick={p.onBackToCredentials} intent="danger" size="sm">
              {t3({ en: "Back to step 1", fr: "Retour à l'étape 1", pt: "Voltar ao passo 1" })}
            </Button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
