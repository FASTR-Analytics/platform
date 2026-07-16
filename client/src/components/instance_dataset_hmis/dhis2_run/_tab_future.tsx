import { t3, type DatasetHmisScheduledImport } from "lib";
import { Button, Table, createDeleteAction, toNum0, type TableColumn } from "panther";
import { Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  schedules: DatasetHmisScheduledImport[];
  onEdit: (schedule: DatasetHmisScheduledImport) => Promise<void>;
  onChanged: () => Promise<void>;
};

// One-time rows the Future tab shows: pending, or terminally attention-
// worthy. Launched rows whose run is running/complete/cancelled are hidden
// (Current tab shows the running run; the tick sweeps the row after) —
// keep this filter in lockstep with sweepSpentOneShotScheduledImports.
export function visibleFutureSchedules(
  schedules: DatasetHmisScheduledImport[],
): DatasetHmisScheduledImport[] {
  return schedules.filter((s) => {
    if (s.kind === "recurring") return true;
    if (!s.lastOutcome) return true;
    if (s.lastOutcome === "refused" || s.lastOutcome === "missed") return true;
    return s.lastOutcome === "launched" && s.lastRunStatus === "error";
  });
}

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

function whenLabel(s: DatasetHmisScheduledImport): string {
  if (s.kind === "one_shot") {
    return s.runAt ? new Date(s.runAt).toLocaleString() : "";
  }
  const every =
    (s.intervalWeeks ?? 1) === 1
      ? t3({ en: "weekly", fr: "chaque semaine", pt: "semanalmente" })
      : `${t3({ en: "every", fr: "toutes les", pt: "a cada" })} ${s.intervalWeeks} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })}`;
  return `${dayOfWeekLabel(s.dayOfWeek ?? 0)} ${s.startTime} (${s.timezone}), ${every}`;
}

function selectionLabel(s: DatasetHmisScheduledImport): string {
  return `${toNum0(s.selection.rawIndicatorIds.length)} ${t3({ en: "indicators", fr: "indicateurs", pt: "indicadores" })} × ${
    s.selection.kind === "explicit_range"
      ? `${s.selection.startPeriod}–${s.selection.endPeriod}`
      : `${t3({ en: "last", fr: "derniers", pt: "últimos" })} ${toNum0(s.selection.monthsBack)} ${t3({ en: "months", fr: "mois", pt: "meses" })}`
  }`;
}

function recurringOutcomeLabel(s: DatasetHmisScheduledImport): { text: string; danger: boolean } {
  if (!s.lastOutcome) {
    return {
      text: t3({ en: "Not run yet", fr: "Pas encore exécutée", pt: "Ainda não executada" }),
      danger: false,
    };
  }
  if (s.lastOutcome === "refused") {
    return { text: t3({ en: "Skipped", fr: "Ignorée", pt: "Ignorada" }), danger: true };
  }
  if (s.lastOutcome === "missed") {
    return { text: t3({ en: "Missed", fr: "Manquée", pt: "Falhada" }), danger: true };
  }
  if (s.lastRunStatus === "error") {
    return {
      text: t3({
        en: "Run failed — see History",
        fr: "Échec de l'importation — voir l'historique",
        pt: "Importação falhou — ver o histórico",
      }),
      danger: true,
    };
  }
  return { text: t3({ en: "Ran", fr: "Exécutée", pt: "Executada" }), danger: false };
}

function oneTimeStatusLabel(s: DatasetHmisScheduledImport): { text: string; danger: boolean } {
  if (!s.lastOutcome) {
    return {
      text: t3({ en: "Scheduled", fr: "Planifiée", pt: "Agendada" }),
      danger: false,
    };
  }
  if (s.lastOutcome === "refused" || s.lastOutcome === "missed") {
    return {
      text: t3({ en: "Didn't run", fr: "Non exécutée", pt: "Não executada" }),
      danger: true,
    };
  }
  return {
    text: t3({
      en: "Run failed — see History",
      fr: "Échec de l'importation — voir l'historique",
      pt: "Importação falhou — ver o histórico",
    }),
    danger: true,
  };
}

function EditDeleteActions(p: { schedule: DatasetHmisScheduledImport; onEdit: (s: DatasetHmisScheduledImport) => Promise<void>; onChanged: () => Promise<void> }) {
  const deleteSchedule = createDeleteAction(
    t3({ en: "Delete this schedule?", fr: "Supprimer cette planification ?", pt: "Eliminar este agendamento?" }),
    () => serverActions.deleteDatasetHmisDhis2Schedule({ id: p.schedule.id }),
    p.onChanged,
  );
  return (
    <div class="ui-gap-sm flex justify-end">
      <Button onClick={() => p.onEdit(p.schedule)} size="sm" outline iconName="pencil">
        {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
      </Button>
      <Button onClick={deleteSchedule.click} size="sm" outline intent="danger" iconName="trash" />
    </div>
  );
}

// Future tab: the schedule listing, minus the inline editor (moved into the
// wizard — PLAN_DHIS2_IMPORTER_UI_REVISION §4) and minus the Enabled toggle
// (removed — PLAN_DHIS2_IMPORTER_UI_FUTURE_LISTING §0: set-and-forget
// scheduling has one place to configure — the wizard via Edit — and one
// off-switch — Delete). Recurring and one-time schedules get separate
// sections since their columns genuinely differ.
export function Dhis2TabFuture(p: Props) {
  const visible = () => visibleFutureSchedules(p.schedules);
  const recurring = () => visible().filter((s) => s.kind === "recurring");
  const oneTime = () =>
    visible()
      .filter((s) => s.kind === "one_shot")
      .sort((a, b) => (a.runAt ?? "").localeCompare(b.runAt ?? ""));

  const recurringColumns: TableColumn<DatasetHmisScheduledImport>[] = [
    {
      key: "kind",
      header: t3({ en: "When", fr: "Quand", pt: "Quando" }),
      render: whenLabel,
    },
    {
      key: "selection",
      header: t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
      render: selectionLabel,
    },
    {
      key: "lastOutcome",
      header: t3({ en: "Last run", fr: "Dernière exécution", pt: "Última execução" }),
      render: (s) => {
        const o = recurringOutcomeLabel(s);
        return (
          <div>
            <span class={o.danger ? "text-danger font-700" : ""}>
              {o.text}
              {s.lastFiredAt ? ` — ${new Date(s.lastFiredAt).toLocaleString()}` : ""}
            </span>
            <Show when={o.danger && s.lastError}>
              <div class="text-danger text-xs">{s.lastError}</div>
            </Show>
          </div>
        );
      },
    },
    {
      key: "createdBy",
      header: t3({ en: "By", fr: "Par", pt: "Por" }),
      render: (s) => s.createdBy,
    },
    {
      key: "id",
      header: "",
      render: (s) => <EditDeleteActions schedule={s} onEdit={p.onEdit} onChanged={p.onChanged} />,
    },
  ];

  const oneTimeColumns: TableColumn<DatasetHmisScheduledImport>[] = [
    {
      key: "runAt",
      header: t3({ en: "Runs at", fr: "Exécution le", pt: "Execução em" }),
      render: (s) => (s.runAt ? new Date(s.runAt).toLocaleString() : ""),
      sortable: true,
      sortValue: (s) => s.runAt ?? "",
    },
    {
      key: "selection",
      header: t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
      render: selectionLabel,
    },
    {
      key: "lastOutcome",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      render: (s) => {
        const o = oneTimeStatusLabel(s);
        return (
          <div>
            <span class={o.danger ? "text-danger font-700" : ""}>{o.text}</span>
            <Show when={o.danger && s.lastError}>
              <div class="text-danger text-xs">{s.lastError}</div>
            </Show>
          </div>
        );
      },
    },
    {
      key: "createdBy",
      header: t3({ en: "By", fr: "Par", pt: "Por" }),
      render: (s) => s.createdBy,
    },
    {
      key: "id",
      header: "",
      render: (s) => <EditDeleteActions schedule={s} onEdit={p.onEdit} onChanged={p.onChanged} />,
    },
  ];

  return (
    <Switch>
      <Match when={visible().length > 0}>
        <div class="ui-spy">
          <Show when={recurring().length > 0}>
            <div class="ui-spy-sm">
              <div class="font-700">
                {t3({ en: "Recurring imports", fr: "Importations récurrentes", pt: "Importações recorrentes" })}
              </div>
              <Table data={recurring()} columns={recurringColumns} keyField="id" />
            </div>
          </Show>
          <Show when={oneTime().length > 0}>
            <div class="ui-spy-sm">
              <div class="font-700">
                {t3({ en: "One-time imports", fr: "Importations ponctuelles", pt: "Importações pontuais" })}
              </div>
              <Table data={oneTime()} columns={oneTimeColumns} keyField="id" />
            </div>
          </Show>
        </div>
      </Match>
      <Match when={visible().length === 0}>
        <div class="text-sm">
          {t3({
            en: "No scheduled imports yet — create one from the wizard's Time step (Later or Recurring).",
            fr: "Aucune importation planifiée pour le moment — créez-en une depuis l'étape Heure de l'assistant (Plus tard ou Récurrente).",
            pt: "Ainda não há importações agendadas — crie uma no passo Hora do assistente (Mais tarde ou Recorrente).",
          })}
        </div>
      </Match>
    </Switch>
  );
}
