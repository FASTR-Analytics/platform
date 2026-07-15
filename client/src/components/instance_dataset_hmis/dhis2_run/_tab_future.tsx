import { t3, type DatasetHmisScheduledImport } from "lib";
import {
  Button,
  Table,
  createDeleteAction,
  openAlert,
  toNum0,
  type TableColumn,
} from "panther";
import { Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  schedules: DatasetHmisScheduledImport[];
  onEdit: (schedule: DatasetHmisScheduledImport) => Promise<void>;
  onChanged: () => Promise<void>;
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

function outcomeLabel(s: DatasetHmisScheduledImport): { text: string; danger: boolean } {
  if (!s.lastOutcome) {
    return {
      text: t3({ en: "Not fired yet", fr: "Pas encore déclenchée", pt: "Ainda não disparada" }),
      danger: false,
    };
  }
  if (s.lastOutcome === "refused") {
    return { text: t3({ en: "Refused", fr: "Refusée", pt: "Recusada" }), danger: true };
  }
  if (s.lastOutcome === "missed") {
    return { text: t3({ en: "Missed", fr: "Manquée", pt: "Falhada" }), danger: true };
  }
  if (s.lastRunStatus === "error") {
    return {
      text: t3({ en: "Launched — run failed", fr: "Lancée — importation en échec", pt: "Iniciada — importação falhou" }),
      danger: true,
    };
  }
  return { text: t3({ en: "Launched", fr: "Lancée", pt: "Iniciada" }), danger: false };
}

// Future tab: the schedule listing, minus the inline editor (moved into the
// wizard — PLAN_DHIS2_IMPORTER_UI_REVISION §4). Enable/disable and delete
// stay as direct row actions (single-click state flips, not configuration).
export function Dhis2TabFuture(p: Props) {
  const columns: TableColumn<DatasetHmisScheduledImport>[] = [
    {
      key: "enabled",
      header: t3({ en: "Enabled", fr: "Activée", pt: "Ativada" }),
      render: (s) => {
        const toggle = async () => {
          const res = await serverActions.setDatasetHmisDhis2ScheduleEnabled({
            id: s.id,
            enabled: !s.enabled,
          });
          if (!res.success) {
            await openAlert({ text: res.err, intent: "danger" });
          }
          await p.onChanged();
        };
        return (
          <Button onClick={toggle} size="sm" outline={!s.enabled}>
            {s.enabled ? t3({ en: "On", fr: "Oui", pt: "Sim" }) : t3({ en: "Off", fr: "Non", pt: "Não" })}
          </Button>
        );
      },
    },
    {
      key: "kind",
      header: t3({ en: "When", fr: "Quand", pt: "Quando" }),
      render: whenLabel,
    },
    {
      key: "selection",
      header: t3({ en: "Selection", fr: "Sélection", pt: "Seleção" }),
      render: (s) =>
        `${toNum0(s.selection.rawIndicatorIds.length)} ${t3({ en: "indicators", fr: "indicateurs", pt: "indicadores" })} × ${t3({
          en: "current + previous",
          fr: "mois courant + précédents",
          pt: "mês atual + anteriores",
        })} ${toNum0(s.selection.monthsBack)} ${t3({ en: "months", fr: "mois", pt: "meses" })}`,
    },
    {
      key: "lastOutcome",
      header: t3({ en: "Last fire", fr: "Dernier déclenchement", pt: "Último disparo" }),
      render: (s) => {
        const o = outcomeLabel(s);
        return (
          <span class={o.danger ? "text-danger font-700" : ""} title={s.lastError}>
            {o.text}
            {s.lastFiredAt ? ` — ${new Date(s.lastFiredAt).toLocaleString()}` : ""}
          </span>
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
      render: (s) => {
        const deleteSchedule = createDeleteAction(
          t3({ en: "Delete this schedule?", fr: "Supprimer cette planification ?", pt: "Eliminar este agendamento?" }),
          () => serverActions.deleteDatasetHmisDhis2Schedule({ id: s.id }),
          p.onChanged,
        );
        return (
          <div class="ui-gap-sm flex justify-end">
            <Button onClick={() => p.onEdit(s)} size="sm" outline iconName="pencil">
              {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
            </Button>
            <Button onClick={deleteSchedule.click} size="sm" outline intent="danger" iconName="trash" />
          </div>
        );
      },
    },
  ];

  return (
    <Switch>
      <Match when={p.schedules.length > 0}>
        <Table
          data={p.schedules}
          columns={columns}
          keyField="id"
          noRowsMessage={t3({ en: "No schedules yet", fr: "Aucune planification pour le moment", pt: "Ainda não há agendamentos" })}
        />
      </Match>
      <Match when={p.schedules.length === 0}>
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
