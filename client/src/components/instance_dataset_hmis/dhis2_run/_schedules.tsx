import {
  t3,
  type DatasetHmisScheduledImport,
  type DatasetHmisScheduledImportFields,
  type DatasetHmisScheduledImportKind,
} from "lib";
import {
  Button,
  Input,
  RadioGroup,
  Select,
  StateHolderFormError,
  Table,
  createDeleteAction,
  createFormAction,
  openAlert,
  toNum0,
  type SelectOption,
  type TableColumn,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2IndicatorPicker } from "./_indicator_picker";

type Props = {
  schedules: DatasetHmisScheduledImport[];
  unattendedReady: boolean;
  hasStoredCredentials: boolean;
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

function outcomeLabel(
  s: DatasetHmisScheduledImport,
): { text: string; danger: boolean } {
  if (!s.lastOutcome) {
    return {
      text: t3({ en: "Not fired yet", fr: "Pas encore déclenchée", pt: "Ainda não disparada" }),
      danger: false,
    };
  }
  if (s.lastOutcome === "refused") {
    return {
      text: t3({ en: "Refused", fr: "Refusée", pt: "Recusada" }),
      danger: true,
    };
  }
  if (s.lastOutcome === "missed") {
    return {
      text: t3({ en: "Missed", fr: "Manquée", pt: "Falhada" }),
      danger: true,
    };
  }
  if (s.lastRunStatus === "error") {
    return {
      text: t3({
        en: "Launched — run failed",
        fr: "Lancée — importation en échec",
        pt: "Iniciada — importação falhou",
      }),
      danger: true,
    };
  }
  return {
    text: t3({ en: "Launched", fr: "Lancée", pt: "Iniciada" }),
    danger: false,
  };
}

export function Dhis2Schedules(p: Props) {
  const [editorOpen, setEditorOpen] = createSignal<boolean>(false);
  const [editingId, setEditingId] = createSignal<number | undefined>(undefined);

  const [kind, setKind] = createSignal<DatasetHmisScheduledImportKind>("recurring");
  const [selectedIndicators, setSelectedIndicators] = createSignal<string[]>([]);
  const [monthsBack, setMonthsBack] = createSignal<string>("12");
  const [runAtLocal, setRunAtLocal] = createSignal<string>("");
  const [dayOfWeek, setDayOfWeek] = createSignal<string>("1");
  const [startTime, setStartTime] = createSignal<string>("01:15");
  const [timezone, setTimezone] = createSignal<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [intervalWeeks, setIntervalWeeks] = createSignal<string>("1");

  function openCreate() {
    setEditingId(undefined);
    setKind("recurring");
    setSelectedIndicators([]);
    setMonthsBack("12");
    setRunAtLocal("");
    setDayOfWeek("1");
    setStartTime("01:15");
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setIntervalWeeks("1");
    setEditorOpen(true);
  }

  function openEdit(s: DatasetHmisScheduledImport) {
    setEditingId(s.id);
    setKind(s.kind);
    setSelectedIndicators(s.selection.rawIndicatorIds);
    setMonthsBack(String(s.selection.monthsBack));
    setRunAtLocal(s.runAt ? toDatetimeLocalValue(s.runAt) : "");
    setDayOfWeek(String(s.dayOfWeek ?? 1));
    setStartTime(s.startTime ?? "01:15");
    setTimezone(
      s.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    setIntervalWeeks(String(s.intervalWeeks ?? 1));
    setEditorOpen(true);
  }

  function toDatetimeLocalValue(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const save = createFormAction(async () => {
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
    const months = parseInt(monthsBack());
    if (isNaN(months) || months < 0) {
      return {
        success: false,
        err: t3({
          en: "Months of history must be a number (0 or more)",
          fr: "Le nombre de mois d'historique doit être un nombre (0 ou plus)",
          pt: "Os meses de histórico devem ser um número (0 ou mais)",
        }),
      };
    }
    const fields: DatasetHmisScheduledImportFields = {
      kind: kind(),
      selection: {
        rawIndicatorIds: selectedIndicators(),
        monthsBack: months,
      },
    };
    if (kind() === "one_shot") {
      if (!runAtLocal()) {
        return {
          success: false,
          err: t3({
            en: "Please choose a date and time",
            fr: "Veuillez choisir une date et une heure",
            pt: "Escolha uma data e hora",
          }),
        };
      }
      fields.runAt = new Date(runAtLocal()).toISOString();
    } else {
      fields.dayOfWeek = parseInt(dayOfWeek());
      fields.startTime = startTime();
      fields.timezone = timezone();
      fields.intervalWeeks = parseInt(intervalWeeks());
    }
    const id = editingId();
    const res =
      id === undefined
        ? await serverActions.createDatasetHmisDhis2Schedule({
            schedule: fields,
          })
        : await serverActions.updateDatasetHmisDhis2Schedule({
            id,
            schedule: fields,
          });
    if (res.success) {
      setEditorOpen(false);
    }
    return res;
  }, p.onChanged);

  const kindOptions: SelectOption<DatasetHmisScheduledImportKind>[] = [
    {
      value: "recurring",
      label: t3({ en: "Recurring", fr: "Récurrente", pt: "Recorrente" }),
    },
    {
      value: "one_shot",
      label: t3({
        en: "Once, at a set time",
        fr: "Une fois, à une heure donnée",
        pt: "Uma vez, a uma hora definida",
      }),
    },
  ];

  const dayOptions: SelectOption<string>[] = [0, 1, 2, 3, 4, 5, 6].map(
    (d) => ({ value: String(d), label: dayOfWeekLabel(d) }),
  );

  const intervalOptions: SelectOption<string>[] = [1, 2, 4].map((w) => ({
    value: String(w),
    label:
      w === 1
        ? t3({ en: "Every week", fr: "Chaque semaine", pt: "Todas as semanas" })
        : `${t3({ en: "Every", fr: "Toutes les", pt: "A cada" })} ${w} ${t3({ en: "weeks", fr: "semaines", pt: "semanas" })}`,
  }));

  const timezoneOptions: SelectOption<string>[] = Intl.supportedValuesOf(
    "timeZone",
  ).map((tz) => ({ value: tz, label: tz }));

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
            {s.enabled
              ? t3({ en: "On", fr: "Oui", pt: "Sim" })
              : t3({ en: "Off", fr: "Non", pt: "Não" })}
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
        `${toNum0(s.selection.rawIndicatorIds.length)} ${t3({
          en: "indicators",
          fr: "indicateurs",
          pt: "indicadores",
        })} × ${t3({
          en: "current + previous",
          fr: "mois courant + précédents",
          pt: "mês atual + anteriores",
        })} ${toNum0(s.selection.monthsBack)} ${t3({ en: "months", fr: "mois", pt: "meses" })}`,
    },
    {
      key: "lastOutcome",
      header: t3({
        en: "Last fire",
        fr: "Dernier déclenchement",
        pt: "Último disparo",
      }),
      render: (s) => {
        const o = outcomeLabel(s);
        return (
          <span
            class={o.danger ? "text-danger font-700" : ""}
            title={s.lastError}
          >
            {o.text}
            {s.lastFiredAt
              ? ` — ${new Date(s.lastFiredAt).toLocaleString()}`
              : ""}
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
          t3({
            en: "Delete this schedule?",
            fr: "Supprimer cette planification ?",
            pt: "Eliminar este agendamento?",
          }),
          () => serverActions.deleteDatasetHmisDhis2Schedule({ id: s.id }),
          p.onChanged,
        );
        return (
          <div class="ui-gap-sm flex justify-end">
            <Button onClick={() => openEdit(s)} size="sm" outline iconName="pencil">
              {t3({ en: "Edit", fr: "Modifier", pt: "Editar" })}
            </Button>
            <Button
              onClick={deleteSchedule.click}
              size="sm"
              outline
              intent="danger"
              iconName="trash"
            />
          </div>
        );
      },
    },
  ];

  return (
    <div class="border-base-300 ui-pad ui-spy rounded border">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 text-lg">
          {t3({
            en: "Scheduled imports",
            fr: "Importations planifiées",
            pt: "Importações agendadas",
          })}
        </div>
        <Show when={!editorOpen()}>
          <Button
            onClick={openCreate}
            iconName="plus"
            disabled={!p.unattendedReady}
          >
            {t3({
              en: "New schedule",
              fr: "Nouvelle planification",
              pt: "Novo agendamento",
            })}
          </Button>
        </Show>
      </div>

      <Show when={!p.unattendedReady}>
        <div class="text-sm">
          <Switch>
            <Match when={!p.hasStoredCredentials}>
              {t3({
                en: "Scheduling needs stored DHIS2 credentials — save them above first.",
                fr: "La planification nécessite des identifiants DHIS2 enregistrés — enregistrez-les d'abord ci-dessus.",
                pt: "O agendamento requer credenciais DHIS2 guardadas — guarde-as primeiro acima.",
              })}
            </Match>
            <Match when={true}>
              {t3({
                en: "Scheduling unlocks after one import against the stored DHIS2 URL has verified cleanly (its first run cross-checks a sample against the analytics engine). Run an import directly first.",
                fr: "La planification se débloque après qu'une importation vers l'URL DHIS2 enregistrée a été vérifiée avec succès (la première importation compare un échantillon avec le moteur analytics). Lancez d'abord une importation directement.",
                pt: "O agendamento é desbloqueado depois de uma importação para o URL DHIS2 guardado ter sido verificada com sucesso (a primeira importação compara uma amostra com o motor analytics). Execute primeiro uma importação diretamente.",
              })}
            </Match>
          </Switch>
        </div>
      </Show>

      <Show when={editorOpen()}>
        <div class="border-base-300 ui-pad ui-spy rounded border">
          <div class="font-700">
            {editingId() === undefined
              ? t3({
                  en: "New schedule",
                  fr: "Nouvelle planification",
                  pt: "Novo agendamento",
                })
              : t3({
                  en: "Edit schedule",
                  fr: "Modifier la planification",
                  pt: "Editar agendamento",
                })}
          </div>
          <RadioGroup
            value={kind()}
            options={kindOptions}
            onChange={setKind}
            horizontal
          />
          <Switch>
            <Match when={kind() === "one_shot"}>
              <Input
                label={t3({
                  en: "Run at",
                  fr: "Exécuter le",
                  pt: "Executar em",
                })}
                type="datetime-local"
                value={runAtLocal()}
                onChange={setRunAtLocal}
              />
            </Match>
            <Match when={kind() === "recurring"}>
              <div class="ui-gap flex flex-wrap items-end">
                <Select
                  label={t3({
                    en: "Day of week",
                    fr: "Jour de la semaine",
                    pt: "Dia da semana",
                  })}
                  value={dayOfWeek()}
                  options={dayOptions}
                  onChange={setDayOfWeek}
                />
                <Input
                  label={t3({
                    en: "Start time",
                    fr: "Heure de début",
                    pt: "Hora de início",
                  })}
                  type="time"
                  value={startTime()}
                  onChange={setStartTime}
                />
                <Select
                  label={t3({ en: "Timezone", fr: "Fuseau horaire", pt: "Fuso horário" })}
                  value={timezone()}
                  options={timezoneOptions}
                  onChange={setTimezone}
                />
                <Select
                  label={t3({ en: "Interval", fr: "Intervalle", pt: "Intervalo" })}
                  value={intervalWeeks()}
                  options={intervalOptions}
                  onChange={setIntervalWeeks}
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
          <Input
            label={t3({
              en: "Months of history (current month + previous N)",
              fr: "Mois d'historique (mois courant + N précédents)",
              pt: "Meses de histórico (mês atual + N anteriores)",
            })}
            type="number"
            value={monthsBack()}
            onChange={setMonthsBack}
          />
          <div>
            <label class="font-700 mb-4 block text-base">
              {t3({
                en: "Indicators to import",
                fr: "Indicateurs à importer",
                pt: "Indicadores a importar",
              })}
            </label>
            <Dhis2IndicatorPicker
              selectedIds={selectedIndicators}
              setSelectedIds={setSelectedIndicators}
            />
          </div>
          <StateHolderFormError state={save.state()} />
          <div class="ui-gap-sm flex">
            <Button onClick={save.click} intent="success" state={save.state()}>
              {t3({ en: "Save schedule", fr: "Enregistrer la planification", pt: "Guardar agendamento" })}
            </Button>
            <Button onClick={() => setEditorOpen(false)} outline>
              {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
            </Button>
          </div>
        </div>
      </Show>

      <Show when={p.schedules.length > 0}>
        <Table
          data={p.schedules}
          columns={columns}
          keyField="id"
          noRowsMessage={t3({
            en: "No schedules yet",
            fr: "Aucune planification pour le moment",
            pt: "Ainda não há agendamentos",
          })}
        />
      </Show>
    </div>
  );
}
