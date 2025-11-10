import { Conflicts, t2, T } from "lib";
import { toNum0 } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { t } from "lib";

type Props = {
  conflicts: Conflicts;
  datasetOrStructure: "dataset" | "structure";
};

export function ConflictsDisplay(p: Props) {
  return (
    <div class="ui-spy">
      <Show
        when={p.conflicts.foreignKeyConflicts.length > 0}
        fallback={<div class="text-success">{t2(T.FRENCH_UI_STRINGS.no_conflicts)}</div>}
      >
        <div class="ui-spy-sm">
          <div class="text-sm font-700">{t("Matching keys")}</div>
          <For each={p.conflicts.foreignKeyConflicts}>
            {(conflict) => {
              return (
                <Switch>
                  <Match when={conflict.nNonMatchingKeys > 3}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        {toNum0(conflict.nNonMatchingKeys)} non-matching values
                        (e.g. {conflict.exampleVals.slice(0, 3).join(", ")},
                        ...) affecting {toNum0(conflict.nNonMatchingRows)} rows
                      </div>
                    </div>
                  </Match>
                  <Match when={conflict.nNonMatchingKeys > 1}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        {conflict.nNonMatchingKeys} non-matching values (
                        {conflict.exampleVals.join(", ")}) affecting{" "}
                        {toNum0(conflict.nNonMatchingRows)} rows
                      </div>
                    </div>
                  </Match>
                  <Match when={conflict.nNonMatchingKeys === 1}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        1 non-matching value (
                        {conflict.exampleVals.slice(0, 3).join(", ")}) affecting{" "}
                        {toNum0(conflict.nNonMatchingRows)} rows
                      </div>
                    </div>
                  </Match>
                  <Match when={true}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-success">Fully matched!</div>
                    </div>
                  </Match>
                </Switch>
              );
            }}
          </For>
        </div>
      </Show>
      <Show when={p.datasetOrStructure === "dataset"}>
        <div class="ui-spy-sm">
          <div class="text-sm font-700">{t("Values")}</div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Missing or bad values")}</div>
            <div
              class="flex-1 text-success data-[error=true]:text-danger"
              data-error={p.conflicts.nMissingVals > 0}
            >
              {toNum0(p.conflicts.nMissingVals)}
            </div>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="text-sm font-700">{t2(T.FRENCH_UI_STRINGS.rows)}</div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Rows in dataset")}</div>
            <div class="flex-1">{toNum0(p.conflicts.nTotalRows)}</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t("Rows that can be imported")}</div>
            <div
              class="flex-1 data-[error=true]:text-danger"
              data-error={p.conflicts.nGoodRows === 0}
            >
              {toNum0(p.conflicts.nGoodRows)}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
