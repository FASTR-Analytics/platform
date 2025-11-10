import { ItemsHolderResultsObject, t, t2, T } from "lib";
import {
  Button,
  Csv,
  EditorComponentProps,
  FrameTop,
  StateHolderWrapper,
  TableFromCsv,
  timQuery,
} from "panther";
import { createMemo, Match, Switch } from "solid-js";
import { _SERVER_HOST } from "~/server_actions/config";
import { serverActions } from "~/server_actions";

export function ViewResultsObject(
  p: EditorComponentProps<
    {
      projectId: string;
      moduleId: string;
      resultsObjectId: string;
    },
    undefined
  >,
) {
  // Query state

  const items = timQuery<ItemsHolderResultsObject>(async () => {
    return await serverActions.getResultsObjectItems({
      projectId: p.projectId,
      results_object_id: p.resultsObjectId,
    });
  }, "Loading results file...");

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap flex h-full w-full items-center border-b bg-base-200">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="flex-1 truncate text-xl font-700">
            {t("RESULTS FILE")}
            <span class="ml-4 font-400">{p.resultsObjectId}</span>
          </div>
          <div class="ui-gap-sm flex items-center">
            <Button
              href={`${_SERVER_HOST}/${p.projectId}/${p.moduleId}/${p.resultsObjectId}?t=${Date.now()}`}
              intent="success"
              download={p.resultsObjectId}
              iconName="download"
            >
              {t2(T.FRENCH_UI_STRINGS.download)}
            </Button>
            <Button iconName="refresh" onClick={items.fetch} />
          </div>
        </div>
      }
    >
      <StateHolderWrapper
        state={items.state()}
        onErrorButton={{
          onClick: () => p.close(undefined),
          label: t("Back to module"),
        }}
      >
        {(keyedItems) => (
          <Switch>
            <Match when={keyedItems.status === "no_data_available"}>
              <div class="ui-pad">No data available</div>
            </Match>
            <Match when={keyedItems.status === "ok"}>
              {(() => {
                const okItems = keyedItems as Extract<
                  typeof keyedItems,
                  { status: "ok" }
                >;
                const csv = createMemo(() => {
                  return Csv.fromObjectArray(okItems.items);
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
