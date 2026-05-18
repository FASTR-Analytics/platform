import { t3, type IcehIndicator } from "lib";
import { StateHolderWrapper, timQuery, Table } from "panther";
import { serverActions } from "~/server_actions";

export function IndicatorsTab() {
  const indicators = timQuery(async () => {
    return await serverActions.getDatasetIcehIndicators({});
  }, t3({ en: "Loading indicators...", fr: "Chargement des indicateurs..." }));

  return (
    <StateHolderWrapper state={indicators.state()}>
      {(data) => (
        <div>
          <p class="text-neutral mb-4 text-sm">
            {data.length} {t3({ en: "indicators", fr: "indicateurs" })}
          </p>
          <div class="max-h-96 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-neutral-light sticky top-0">
                <tr>
                  <th class="p-2 text-left">{t3({ en: "Code", fr: "Code" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Name", fr: "Nom" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Category", fr: "Catégorie" })}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((ind) => (
                  <tr class="border-b">
                    <td class="p-2 font-mono text-xs">{ind.indicatorCode}</td>
                    <td class="p-2">{ind.indicatorName}</td>
                    <td class="p-2">{ind.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </StateHolderWrapper>
  );
}
