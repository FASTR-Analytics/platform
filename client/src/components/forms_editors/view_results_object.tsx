import { ItemsHolderResultsObject, t3, TC } from "lib";
import {
  Button,
  Csv,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  TableFromCsv,
  createQuery,
} from "panther";
import { createMemo, Match, Show, Switch } from "solid-js";
import { _SERVER_HOST } from "~/server_actions";
import { serverActions } from "~/server_actions";

export function ViewResultsObject(
  p: EditorComponentProps<
    {
      projectId: string;
      runId: string | null;
      moduleId: string;
      resultsObjectId: string;
    },
    undefined
  >,
) {
  // Query state

  const items = createQuery<ItemsHolderResultsObject>(async () => {
    return await serverActions.getResultsObjectItems({
      projectId: p.projectId,
      results_object_id: p.resultsObjectId,
    });
  }, t3({ en: "Loading results file...", fr: "Chargement du fichier de résultats...", pt: "A carregar o ficheiro de resultados..." }));

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3({ en: "RESULTS FILE", fr: "FICHIER DE RÉSULTATS", pt: "FICHEIRO DE RESULTADOS" })}
          subheading={p.resultsObjectId}
        >
          <div class="ui-gap-sm flex items-center">
            <Show when={p.runId} keyed>
              {(keyedRunId) => (
                <Button
                  href={`${_SERVER_HOST}/${keyedRunId}/outputs/${p.moduleId}/${p.resultsObjectId}?t=${Date.now()}`}
                  intent="success"
                  download={p.resultsObjectId}
                  iconName="download"
                >
                  {t3(TC.download)}
                </Button>
              )}
            </Show>
            <Button iconName="refresh" onClick={items.fetch} />
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper
        state={items.state()}
        onErrorButton={{
          onClick: () => p.close(undefined),
          label: t3({ en: "Back to module", fr: "Retour au module", pt: "Voltar ao módulo" }),
        }}
      >
        {(keyedItems) => (
          <Switch>
            <Match when={keyedItems.status === "no_data_available"}>
              <div class="ui-pad">{t3({ en: "No data available", fr: "Aucune donnée disponible", pt: "Não há dados disponíveis" })}</div>
            </Match>
            <Match when={keyedItems.status === "ok"}>
              {(() => {
                const okItems = keyedItems as Extract<
                  typeof keyedItems,
                  { status: "ok" }
                >;
                const csv = createMemo(() => {
                  return Csv.fromObjects(okItems.items);
                });
                return (
                  <TableFromCsv
                    csv={csv()}
                    unsorted
                    knownTotalCount={okItems.totalCount}
                  />
                );
              })()}
            </Match>
          </Switch>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
