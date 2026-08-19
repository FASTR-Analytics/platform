import { ItemsHolderResultsObject, PackageScope, t3, TC } from "lib";
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
import { createMemo, Match, Switch } from "solid-js";
import { _SERVER_HOST } from "~/server_actions";
import { serverActions } from "~/server_actions";

// The RAW results file behind a metric, read straight from the run directory
// under the caller's PackageScope (D7). Scoped, not national: the read applies
// the same area filter the figure queries do, so an AA2 product's raw preview
// shows that product's rows.
export function ViewResultsObject(
  p: EditorComponentProps<
    {
      scope: PackageScope;
      moduleId: string;
      resultsObjectId: string;
    },
    undefined
  >,
) {
  // Query state

  const items = createQuery<ItemsHolderResultsObject>(async () => {
    return await serverActions.getRunResultsObjectItems({
      run_id: p.scope.runId,
      results_object_id: p.resultsObjectId,
      adminArea2: p.scope.adminArea2,
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
            <Button
              href={`${_SERVER_HOST}/${p.scope.runId}/outputs/${p.moduleId}/${p.resultsObjectId}?t=${Date.now()}`}
              intent="success"
              download={p.resultsObjectId}
              iconName="download"
            >
              {t3(TC.download)}
            </Button>
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
