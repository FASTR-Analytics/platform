import { Conflicts, t3 } from "lib";
import { toNum0 } from "panther";
import { For, Match, Show, Switch } from "solid-js";

type Props = {
  conflicts: Conflicts;
  datasetOrStructure: "dataset" | "structure";
};

export function ConflictsDisplay(p: Props) {
  return (
    <div class="ui-spy">
      <Show
        when={p.conflicts.foreignKeyConflicts.length > 0}
        fallback={<div class="text-success">{t3({ en: "No conflicts!", fr: "Aucun conflit !" })}</div>}
      >
        <div class="ui-spy-sm">
          <div class="text-sm font-700">{t3({ en: "Matching keys", fr: "Clés correspondantes" })}</div>
          <For each={p.conflicts.foreignKeyConflicts}>
            {(conflict) => {
              return (
                <Switch>
                  <Match when={conflict.nNonMatchingKeys > 3}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        {toNum0(conflict.nNonMatchingKeys)} {t3({ en: "non-matching values", fr: "valeurs non correspondantes" })}
                        ({t3({ en: "e.g.", fr: "p. ex." })} {conflict.exampleVals.slice(0, 3).join(", ")},
                        ...) {t3({ en: "affecting", fr: "affectant" })} {toNum0(conflict.nNonMatchingRows)} {t3({ en: "rows", fr: "lignes" })}
                      </div>
                    </div>
                  </Match>
                  <Match when={conflict.nNonMatchingKeys > 1}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        {conflict.nNonMatchingKeys} {t3({ en: "non-matching values", fr: "valeurs non correspondantes" })} (
                        {conflict.exampleVals.join(", ")}) {t3({ en: "affecting", fr: "affectant" })}{" "}
                        {toNum0(conflict.nNonMatchingRows)} {t3({ en: "rows", fr: "lignes" })}
                      </div>
                    </div>
                  </Match>
                  <Match when={conflict.nNonMatchingKeys === 1}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-danger">
                        1 {t3({ en: "non-matching value", fr: "valeur non correspondante" })} (
                        {conflict.exampleVals.slice(0, 3).join(", ")}) {t3({ en: "affecting", fr: "affectant" })}{" "}
                        {toNum0(conflict.nNonMatchingRows)} {t3({ en: "rows", fr: "lignes" })}
                      </div>
                    </div>
                  </Match>
                  <Match when={true}>
                    <div class="flex items-center">
                      <div class="w-56 flex-none">{conflict.col}</div>
                      <div class="flex-1 text-success">{t3({ en: "Fully matched!", fr: "Correspondance complète !" })}</div>
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
          <div class="text-sm font-700">{t3({ en: "Values", fr: "Valeurs" })}</div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t3({ en: "Missing or bad values", fr: "Valeurs manquantes ou erronées" })}</div>
            <div
              class="flex-1 text-success data-[error=true]:text-danger"
              data-error={p.conflicts.nMissingVals > 0}
            >
              {toNum0(p.conflicts.nMissingVals)}
            </div>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="text-sm font-700">{t3({ en: "Rows", fr: "Lignes" })}</div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t3({ en: "Rows in dataset", fr: "Lignes dans le jeu de données" })}</div>
            <div class="flex-1">{toNum0(p.conflicts.nTotalRows)}</div>
          </div>
          <div class="flex items-center">
            <div class="w-56 flex-none">{t3({ en: "Rows that can be imported", fr: "Lignes importables" })}</div>
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
