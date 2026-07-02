import { t3, type DatasetDhis2StagingResult, type Dhis2ScopedDeletionPreviewItem } from "lib";
import { Button, createDeleteAction, createQuery } from "panther";
import { For, Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  step3Result: DatasetDhis2StagingResult;
  silentFetch: () => Promise<void>;
};

export function Step4_Dhis2(p: Props) {
  const hasDeletionScope =
    Array.isArray(p.step3Result.succeededWorkItems) &&
    Array.isArray(p.step3Result.fetchedFacilityIds);

  // Only fetch a preview when there's a scope to preview — an old-format
  // staging result (no succeededWorkItems/fetchedFacilityIds) has nothing to
  // scope-delete, so integration falls back to the legacy merge and there's
  // nothing destructive to warn about here.
  const deletionPreview = hasDeletionScope
    ? createQuery(
        () => serverActions.getDhis2ScopedDeletionPreview({}),
        t3({ en: "Checking existing data...", fr: "Vérification des données existantes...", pt: "A verificar os dados existentes..." }),
      )
    : undefined;

  // "loading"/"error" are distinct from a genuinely-empty ready result — both
  // mean "we don't know," not "nothing to remove," and must never be silently
  // treated as the latter (that would show a confirm dialog implying nothing
  // will happen when rows may in fact be removed).
  const previewStatus = (): "loading" | "ready" | "error" | undefined =>
    deletionPreview?.state().status;

  const preview = (): Dhis2ScopedDeletionPreviewItem[] => {
    const s = deletionPreview?.state();
    return s?.status === "ready" ? s.data : [];
  };

  const totalRowsToRemove = () =>
    preview().reduce((sum, r) => sum + r.rowsToRemove, 0);

  // Fixes the pre-existing gate that blocked exactly the case this plan
  // exists for: every DHIS2 fetch succeeds but returns zero rows everywhere
  // (all phantom cells legitimately gone) — finalStagingRowCount is then 0,
  // but there is real, nonzero work to do (the scoped delete).
  const canProceed = () =>
    p.step3Result.finalStagingRowCount > 0 || totalRowsToRemove() > 0;

  // Built fresh per click (not once at setup) so the confirm dialog's
  // itemList reflects the latest resolved preview — confirmText is a plain
  // value, evaluated once whenever createDeleteAction is called, not a
  // reactive accessor, so a version built once at component setup would
  // freeze on the pre-fetch (empty) preview. Mirrors the same-wizard pattern
  // in index.tsx's attemptDeleteUploadAttempt.
  async function attemptIntegrate() {
    // If the check is merely still in flight, wait for it instead of showing
    // a "could not check" caveat for a check that hasn't failed. silentFetch
    // re-runs the query; the in-flight request is superseded (requestId).
    if (deletionPreview && deletionPreview.state().status === "loading") {
      await deletionPreview.silentFetch();
    }

    const items = preview().map(
      (r) => `${r.indicatorRawId} / ${r.periodId}: ${t3({ en: "remove", fr: "supprimer" })} ${r.rowsToRemove}`,
    );

    // Say so plainly rather than showing an empty list that implies nothing
    // will be removed — the scoped delete still runs correctly regardless of
    // whether this preview loaded, so silence here would be misleading, not
    // just incomplete.
    if (hasDeletionScope && previewStatus() !== "ready") {
      items.unshift(
        t3({
          en: "Could not check how many existing rows will be removed. Proceeding will still correctly remove any rows DHIS2 no longer returns for the fetched scope.",
          fr: "Impossible de vérifier combien de lignes existantes seront supprimées. La poursuite supprimera quand même correctement toutes les lignes que DHIS2 ne renvoie plus pour la portée récupérée.",
          pt: "Não foi possível verificar quantas linhas existentes serão removidas. Ao prosseguir, as linhas que o DHIS2 já não devolve para o âmbito obtido serão corretamente removidas na mesma.",
        }),
      );
    }

    const integrate = createDeleteAction(
      {
        text: t3({
          en: "This will remove existing rows DHIS2 no longer returns, and write the newly fetched values.",
          fr: "Cela supprimera les lignes existantes que DHIS2 ne renvoie plus, et écrira les nouvelles valeurs récupérées.",
          pt: "Isto removerá as linhas existentes que o DHIS2 já não devolve e escreverá os novos valores obtidos.",
        }),
        itemList: items,
      },
      () => serverActions.finalizeDatasetIntegration({}),
      p.silentFetch,
    );

    await integrate.click();
  }

  return (
    <div class="ui-spy ui-pad flex flex-col">
      <div class="ui-pad border-base-300 rounded border">
        <h2 class="font-700 mb-4 text-lg">{t3({ en: "Import Summary", fr: "Résumé de l'importation", pt: "Resumo da importação" })}</h2>

        <div class="ui-gap grid grid-cols-12">
          <div class="col-span-12">
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Source Type:", fr: "Type de source :", pt: "Tipo de fonte:" })}</span>
                <span class="font-mono text-sm">
                  {p.step3Result.sourceType}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Date Imported:", fr: "Date d'importation :", pt: "Data de importação:" })}</span>
                <span class="font-mono text-sm">
                  {new Date(p.step3Result.dateImported).toLocaleString()}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Total Indicator-Period Combos:", fr: "Total combinaisons indicateur-période :", pt: "Total de combinações indicador-período:" })}
                </span>
                <span class="font-mono text-sm">
                  {p.step3Result.totalIndicatorPeriodCombos}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Successful Fetches:", fr: "Récupérations réussies :", pt: "Obtenções bem-sucedidas:" })}
                </span>
                <span class="font-mono text-sm" data-intent="success">
                  {p.step3Result.successfulFetches}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">{t3({ en: "Failed Fetches:", fr: "Récupérations échouées :", pt: "Obtenções falhadas:" })}</span>
                <span
                  class="font-mono text-sm"
                  data-intent={
                    p.step3Result.failedFetches.length > 0
                      ? "danger"
                      : "neutral"
                  }
                >
                  {p.step3Result.failedFetches.length}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-base-content text-sm">
                  {t3({ en: "Final Staging Row Count:", fr: "Total de lignes préparées :", pt: "Total de linhas preparadas:" })}
                </span>
                <span class="font-700 font-mono text-sm">
                  {p.step3Result.finalStagingRowCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {p.step3Result.failedFetches.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 text-danger mb-3 text-base">{t3({ en: "Failed Fetches", fr: "Récupérations échouées", pt: "Obtenções falhadas" })}</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période", pt: "ID do período" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Error", fr: "Erreur", pt: "Erro" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.failedFetches}>
                  {(fail) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">
                        {fail.indicatorRawId}
                      </td>
                      <td class="p-2 font-mono text-xs">{fail.periodId}</td>
                      <td class="text-danger p-2 text-xs">{fail.error}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.periodIndicatorStats.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">{t3({ en: "Period-Indicator Statistics", fr: "Statistiques période-indicateur", pt: "Estatísticas período-indicador" })}</h3>
          <div class="max-h-64 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période", pt: "ID do período" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" })}</th>
                  <th class="font-700 p-2 text-right">{t3({ en: "Records", fr: "Enregistrements", pt: "Registos" })}</th>
                  <th class="font-700 p-2 text-right">{t3({ en: "Total Count", fr: "Total", pt: "Total" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.periodIndicatorStats}>
                  {(stat) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{stat.periodId}</td>
                      <td class="p-2 font-mono text-xs">
                        {stat.indicatorRawId}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.nRecords}
                      </td>
                      <td class="p-2 text-right font-mono text-xs">
                        {stat.totalCount}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {p.step3Result.workItemHistory.length > 0 && (
        <div class="ui-pad border-base-300 rounded border">
          <h3 class="font-700 mb-3 text-base">{t3({ en: "Work Item History", fr: "Historique des tâches", pt: "Histórico de tarefas" })}</h3>
          <div class="max-h-48 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-base-300 border-b">
                  <th class="font-700 p-2 text-left">{t3({ en: "Indicator ID", fr: "ID indicateur", pt: "ID do indicador" })}</th>
                  <th class="font-700 p-2 text-left">{t3({ en: "Period ID", fr: "ID période", pt: "ID do período" })}</th>
                  <th class="font-700 p-2 text-center">{t3({ en: "Status", fr: "Statut", pt: "Estado" })}</th>
                </tr>
              </thead>
              <tbody>
                <For each={p.step3Result.workItemHistory}>
                  {(item) => (
                    <tr class="border-base-200 hover:bg-base-100 border-b">
                      <td class="p-2 font-mono text-xs">{item.indicatorId}</td>
                      <td class="p-2 font-mono text-xs">{item.periodId}</td>
                      <td class="p-2 text-center">
                        <span
                          class="text-xs"
                          data-intent={item.success ? "success" : "danger"}
                        >
                          {item.success ? t3({ en: "Success", fr: "Succès", pt: "Sucesso" }) : t3({ en: "Failed", fr: "Échoué", pt: "Falhou" })}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div class="ui-gap-sm flex flex-col">
        <Switch>
          <Match when={canProceed()}>
            <Button
              onClick={attemptIntegrate}
              intent="success"
              iconName="save"
            >
              {t3({ en: "Integrate and finalize", fr: "Intégrer et finaliser", pt: "Integrar e finalizar" })}
            </Button>
          </Match>
          <Match when={previewStatus() === "loading"}>
            {/* finalStagingRowCount is 0 here and the preview hasn't resolved
                yet — don't show "no rows to import" until we actually know
                that; it may turn out there IS work to do (a scoped delete). */}
            <div class="bg-base-100 border-base-300 rounded border p-3 text-sm">
              {t3({ en: "Checking for existing data to remove...", fr: "Vérification des données existantes à supprimer...", pt: "A verificar se existem dados a remover..." })}
            </div>
          </Match>
          <Match when={previewStatus() === "error"}>
            {/* Same reasoning as above, but the check failed rather than
                being in flight — don't claim there's nothing to import; let
                the user proceed deliberately instead, same as the common-case
                error handling in attemptIntegrate(). */}
            <div class="ui-spy-sm flex flex-col">
              <div class="bg-warning-50 border-warning-300 rounded border p-3 text-sm">
                {t3({ en: "Could not check whether there is existing data to remove.", fr: "Impossible de vérifier s'il existe des données existantes à supprimer.", pt: "Não foi possível verificar se existem dados a remover." })}
              </div>
              <Button
                onClick={attemptIntegrate}
                intent="danger"
                iconName="save"
              >
                {t3({ en: "Integrate and finalize", fr: "Intégrer et finaliser", pt: "Integrar e finalizar" })}
              </Button>
            </div>
          </Match>
          <Match when={true}>
            <div class="bg-warning-50 border-warning-300 rounded border p-3 text-sm">
              {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Il n'y a aucune ligne à importer. Retournez modifier la configuration ou supprimez la tentative d'importation.", pt: "Não há linhas para importar. Volte atrás e edite esta configuração de carregamento, ou elimine a tentativa de carregamento." })}
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
