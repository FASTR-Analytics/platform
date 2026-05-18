import { t3 } from "lib";
import { StateHolderWrapper, timQuery } from "panther";
import { serverActions } from "~/server_actions";

export function DataTab() {
  const data = timQuery(async () => {
    return await serverActions.getDatasetIcehData({});
  }, t3({ en: "Loading data...", fr: "Chargement des données..." }));

  return (
    <StateHolderWrapper state={data.state()}>
      {(rows) => (
        <div>
          <p class="text-neutral mb-4 text-sm">
            {rows.length.toLocaleString()} {t3({ en: "data rows", fr: "lignes de données" })}
          </p>
          <div class="max-h-96 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-neutral-light sticky top-0">
                <tr>
                  <th class="p-2 text-left">{t3({ en: "Indicator", fr: "Indicateur" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Year", fr: "Année" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Source", fr: "Source" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Strat", fr: "Strat" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Level", fr: "Niveau" })}</th>
                  <th class="p-2 text-right">{t3({ en: "Estimate", fr: "Estimation" })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr class="border-b">
                    <td class="p-2 font-mono text-xs">{row.indicatorCode}</td>
                    <td class="p-2">{row.year}</td>
                    <td class="p-2">{row.source}</td>
                    <td class="p-2">{row.strat}</td>
                    <td class="p-2">{row.level}</td>
                    <td class="p-2 text-right">
                      {row.estimate !== null ? row.estimate.toFixed(1) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p class="text-neutral mt-2 text-sm">
                {t3({
                  en: `Showing first 100 of ${rows.length.toLocaleString()} rows`,
                  fr: `Affichage des 100 premières lignes sur ${rows.length.toLocaleString()}`,
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </StateHolderWrapper>
  );
}
