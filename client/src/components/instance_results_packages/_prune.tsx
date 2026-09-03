import { t3, TC, type RunCatalogItem } from "lib";
import {
  AlertComponentProps,
  Badge,
  Button,
  ModalContainer,
  ProgressBar,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { planPrune, type KeepReason, type PrunePlan } from "./_prune_plan";

type Phase = "confirm" | "running" | "done";
type Outcome = "deleted" | { err: string };

const HEADING = {
  en: "Prune results packages",
  fr: "Élaguer les paquets de résultats",
  pt: "Limpar pacotes de resultados",
};

const KEEP_REASON_LABEL: Record<KeepReason, { en: string; fr: string; pt: string }> = {
  pinned: { en: "pinned", fr: "épinglé", pt: "fixado" },
  generating: { en: "still generating", fr: "en cours de génération", pt: "ainda em geração" },
  in_use: { en: "in use by", fr: "utilisé par", pt: "em uso por" },
};

// Bulk guarded delete (PLAN_PRUNE): the plan is snapshotted from T1 at
// confirm, then each package goes through the SAME single delete the detail
// pane uses, in turn. A guard refusal (a project attached between confirm
// and that package's turn) is an outcome by label, never an abort. Nothing
// is refetched — every delete pushes runs_catalog_updated and the sidebar
// shrinks live. No cancel while running: every completed step was a whole
// act, and stopping mid-list would leave a confusing listing state.
export function PruneResultsPackages(
  p: AlertComponentProps<Record<never, never>, undefined>,
) {
  const [phase, setPhase] = createSignal<Phase>("confirm");
  // The whole list renders up front from the confirm-time snapshot; only
  // each row's badge moves (pending → deleting → deleted/refused), so the
  // modal never changes height while it runs.
  const [snapshot, setSnapshot] = createSignal<RunCatalogItem[]>([]);
  const [outcomes, setOutcomes] = createStore<Record<string, Outcome>>({});

  const plan = (): PrunePlan =>
    planPrune("not_in_use", instanceState.runsCatalog, instanceState.pinnedRunId);

  async function run(): Promise<void> {
    const items = plan().delete;
    setSnapshot(items);
    setPhase("running");
    for (const item of items) {
      const res = await serverActions.deleteRun({ run_id: item.id });
      setOutcomes(item.id, res.success ? "deleted" : { err: res.err });
    }
    setPhase("done");
  }

  const doneCount = () => Object.keys(outcomes).length;
  const deletedCount = () =>
    Object.values(outcomes).filter((o) => o === "deleted").length;
  const refusedCount = () => doneCount() - deletedCount();
  const total = () => snapshot().length;
  const rowState = (id: string): "pending" | "deleting" | Outcome => {
    const outcome = outcomes[id];
    if (outcome !== undefined) return outcome;
    return snapshot()[doneCount()]?.id === id ? "deleting" : "pending";
  };

  return (
    <ModalContainer
      width="md"
      topPanel={<div class="font-700 text-lg">{t3(HEADING)}</div>}
      rightButtons={
        <Switch>
          <Match when={phase() === "confirm"}>
            <Button onClick={() => p.close(undefined)} outline>
              {t3(TC.cancel)}
            </Button>
            <Button
              onClick={run}
              intent="danger"
              iconName="trash"
              disabled={plan().delete.length === 0}
            >
              {t3(TC.delete)}
            </Button>
          </Match>
          <Match when={phase() === "done"}>
            <Button onClick={() => p.close(undefined)}>
              {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
            </Button>
          </Match>
        </Switch>
      }
    >
      <Switch>
        <Match when={phase() === "confirm"}>
          <ConfirmBody plan={plan()} />
        </Match>
        <Match when={phase() !== "confirm"}>
          <div class="ui-spy">
            <ProgressBar
              small
              progressFrom0To100={total() === 0 ? 100 : (doneCount() / total()) * 100}
              progressMsg={
                phase() === "done"
                  ? t3({
                      en: `${deletedCount()} deleted, ${refusedCount()} refused`,
                      fr: `${deletedCount()} supprimés, ${refusedCount()} refusés`,
                      pt: `${deletedCount()} eliminados, ${refusedCount()} recusados`,
                    })
                  : t3({
                      en: `Deleting ${doneCount() + 1} of ${total()}...`,
                      fr: `Suppression de ${doneCount() + 1} sur ${total()}...`,
                      pt: `A eliminar ${doneCount() + 1} de ${total()}...`,
                    })
              }
            />
            <div class="ui-spy-sm">
              <For each={snapshot()}>
                {(run) => (
                  <div class="ui-gap-sm flex items-center text-sm">
                    <div class="min-w-0 flex-1 truncate">{run.label}</div>
                    <RowBadge state={rowState(run.id)} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </Match>
      </Switch>
    </ModalContainer>
  );
}

function RowBadge(p: { state: "pending" | "deleting" | Outcome }) {
  return (
    <Switch>
      <Match when={p.state === "pending"}>
        <Badge intent="neutral">
          {t3({ en: "Pending", fr: "En attente", pt: "Pendente" })}
        </Badge>
      </Match>
      <Match when={p.state === "deleting"}>
        <Badge intent="neutral">
          <span class="inline-flex items-center gap-1">
            {t3({ en: "Deleting", fr: "Suppression", pt: "A eliminar" })}
            <span class="animate-pulse">●</span>
          </span>
        </Badge>
      </Match>
      <Match when={p.state === "deleted"}>
        <Badge intent="success">
          {t3({ en: "Deleted", fr: "Supprimé", pt: "Eliminado" })}
        </Badge>
      </Match>
      <Match when={typeof p.state === "object" ? p.state : undefined} keyed>
        {(refused) => <Badge intent="danger">{refused.err}</Badge>}
      </Match>
    </Switch>
  );
}

function ConfirmBody(p: { plan: PrunePlan }) {
  return (
    <div class="ui-spy">
      <Show
        when={p.plan.delete.length > 0}
        fallback={
          <div>
            {t3({
              en: "Nothing to prune — every results package is in use.",
              fr: "Rien à élaguer — tous les paquets de résultats sont utilisés.",
              pt: "Nada a limpar — todos os pacotes de resultados estão em uso.",
            })}
          </div>
        }
      >
        <div>
          {t3({
            en: `${p.plan.delete.length} results packages not in use will be permanently deleted, with their files and cached results.`,
            fr: `${p.plan.delete.length} paquets de résultats non utilisés seront définitivement supprimés, avec leurs fichiers et leurs résultats mis en cache.`,
            pt: `${p.plan.delete.length} pacotes de resultados não utilizados serão eliminados permanentemente, com os seus ficheiros e resultados em cache.`,
          })}
        </div>
        <PackageList
          heading={t3({ en: "To delete", fr: "À supprimer", pt: "A eliminar" })}
          items={p.plan.delete.map((run) => ({ run, note: null }))}
        />
      </Show>
      <Show when={p.plan.keep.length > 0}>
        <PackageList
          heading={t3({ en: "Kept", fr: "Conservés", pt: "Mantidos" })}
          items={p.plan.keep.map(({ run, reason }) => ({
            run,
            note:
              reason === "in_use"
                ? `${t3(KEEP_REASON_LABEL.in_use)} ${
                    run.attachedProjects.map((pr) => pr.label).join(", ")
                  }`
                : t3(KEEP_REASON_LABEL[reason]),
          }))}
        />
      </Show>
    </div>
  );
}

function PackageList(p: {
  heading: string;
  items: { run: RunCatalogItem; note: string | null }[];
}) {
  return (
    <div class="ui-spy-sm">
      <div class="ui-text-overline">{p.heading}</div>
      <For each={p.items}>
        {(item) => (
          <div class="ui-gap-sm flex items-center text-sm">
            <div class="min-w-0 flex-1 truncate">{item.run.label}</div>
            <Show when={item.note} keyed>
              {(note) => <div class="ui-text-caption truncate">{note}</div>}
            </Show>
            <div class="ui-text-caption shrink-0">
              {new Date(item.run.createdAt).toLocaleDateString()}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
