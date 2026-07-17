import { t3, type DatasetHmisImportRunSummary, type DatasetHmisScheduledImport } from"lib";
import {
 Button,
 CollapsibleSection,
 Table,
 createDeleteAction,
 toNum0,
 type TableColumn,
} from"panther";
import { Show } from"solid-js";
import { serverActions } from"~/server_actions";
import { Dhis2RunView } from"./_run_view";

type Props = {
 runningRun: DatasetHmisImportRunSummary | undefined;
 queuedRuns: DatasetHmisImportRunSummary[];
 nextSchedule: DatasetHmisScheduledImport | undefined;
 onNewImport: () => Promise<void>;
 onChanged: () => Promise<void>;
};

function selectionLabel(run: DatasetHmisImportRunSummary): string {
 if (run.selection.kind ==="window") {
 return`${toNum0(run.selection.rawIndicatorIds.length)} ${t3({
 en:"indicators",
 fr:"indicateurs",
 pt:"indicadores",
    })} · ${run.selection.startPeriod}–${run.selection.endPeriod}`;
  }
 return`${toNum0(run.selection.nPairs)} ${t3({ en:"pairs", fr:"paires", pt:"pares"})}`;
}

export function Dhis2TabCurrent(p: Props) {
 const queuedColumns: TableColumn<DatasetHmisImportRunSummary>[] = [
    {
 key:"id",
 header:"#",
 render: (run) =>`${p.queuedRuns.indexOf(run) + 1}`,
    },
    {
 key:"startedAt",
 header: t3({ en:"Queued at", fr:"Mise en file le", pt:"Em fila desde"}),
 render: (run) => new Date(run.startedAt).toLocaleString(),
    },
    {
 key:"triggeredBy",
 header: t3({ en:"By", fr:"Par", pt:"Por"}),
 render: (run) => run.triggeredBy ??"",
    },
    {
 key:"selection",
 header: t3({ en:"Selection", fr:"Sélection", pt:"Seleção"}),
 render: selectionLabel,
    },
    {
 key:"status",
 header:"",
 render: (run) => {
 const remove = createDeleteAction(
 t3({
 en:"Remove this import from the queue?",
 fr:"Retirer cette importation de la file d'attente ?",
 pt:"Remover esta importação da fila?",
          }),
          () => serverActions.cancelDatasetHmisDhis2Run({ runId: run.id }),
 p.onChanged,
        );
 return (
          <div class="flex justify-end">
            <Button onClick={remove.click} size="sm"outline intent="danger">
              {t3({ en:"Remove", fr:"Retirer", pt:"Remover"})}
            </Button>
          </div>
        );
      },
    },
  ];

 return (
    <div class="ui-spy">
      <Show
 when={p.runningRun}
 fallback={
          <div class="ui-pad ui-spy-sm rounded border">
            <div class="text-sm">
              {t3({ en:"No imports running.", fr:"Aucune importation en cours.", pt:"Nenhuma importação em curso."})}
            </div>
            <Show when={p.nextSchedule} keyed>
              {(next) => (
                <div class="text-xs">
                  {t3({
 en:"Next scheduled import:",
 fr:"Prochaine importation planifiée :",
 pt:"Próxima importação agendada:",
                  })}{""}
                  {next.kind ==="one_shot"&& next.runAt
                    ? new Date(next.runAt).toLocaleString()
                    :`${next.startTime ??""} (${next.timezone ??""})`}
                  {"—"}
                  {t3({ en:"see the Future tab", fr:"voir l'onglet À venir", pt:"ver o separador Futuro"})}
                </div>
              )}
            </Show>
            <Button onClick={p.onNewImport} iconName="databaseImport">
              {t3({ en:"New import", fr:"Nouvelle importation", pt:"Nova importação"})}
            </Button>
          </div>
        }
      >
        {(run) => (
          <CollapsibleSection
 defaultOpen
 boldHeader
 title={
              <>
                {t3({ en:"Import in progress", fr:"Importation en cours", pt:"Importação em curso"})}{""}
                <span class="text-sm font-400">
                  — {toNum0(run().succeededPairs + run().failedPairs)} / {toNum0(run().totalPairs)}{""}
                  {t3({ en:"pairs done", fr:"paires traitées", pt:"pares concluídos"})}
                </span>
              </>
            }
          >
            <Dhis2RunView run={run()} onChanged={p.onChanged} />
          </CollapsibleSection>
        )}
      </Show>

      <Show when={p.queuedRuns.length > 0}>
        <div class="ui-spy-sm">
          <div class="font-700 text-lg">
            {t3({ en:"Queued imports", fr:"Importations en file d'attente", pt:"Importações em fila"})}
          </div>
          <div class="text-sm">
            {t3({
 en:"These start automatically, in order, once the current import (or CSV operation) finishes. They run with the stored credentials.",
 fr:"Elles démarrent automatiquement, dans l'ordre, dès que l'importation en cours (ou l'opération CSV) se termine. Elles utilisent les identifiants enregistrés.",
 pt:"Estas começam automaticamente, por ordem, assim que a importação atual (ou a operação CSV) terminar. Utilizam as credenciais guardadas.",
            })}
          </div>
          <Table
 data={p.queuedRuns}
 columns={queuedColumns}
 keyField="id"
 noRowsMessage={t3({ en:"No queued imports", fr:"Aucune importation en file d'attente", pt:"Nenhuma importação em fila"})}
          />
        </div>
      </Show>

      <Show when={p.runningRun}>
        <div>
          <Button onClick={p.onNewImport} outline iconName="plus">
            {t3({ en:"Queue another import", fr:"Mettre une autre importation en file d'attente", pt:"Colocar outra importação em fila"})}
          </Button>
        </div>
      </Show>
    </div>
  );
}
