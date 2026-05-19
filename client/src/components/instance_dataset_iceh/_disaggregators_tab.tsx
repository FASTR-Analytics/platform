import { t3, type IcehDisaggregator } from "lib";
import { StateHolderWrapper, timQuery } from "panther";
import { serverActions } from "~/server_actions";

export function DisaggregatorsTab() {
  const disaggregators = timQuery(async () => {
    return await serverActions.getDatasetIcehDisaggregators({});
  }, t3({ en: "Loading disaggregators...", fr: "Chargement des désagrégateurs..." }));

  return (
    <StateHolderWrapper state={disaggregators.state()}>
      {(data) => (
        <div>
          <p class="text-neutral mb-4 text-sm">
            {data.length} {t3({ en: "disaggregators", fr: "désagrégateurs" })}
          </p>
          <div class="max-h-96 overflow-auto">
            <table class="w-full text-sm">
              <thead class="bg-neutral-light sticky top-0">
                <tr>
                  <th class="p-2 text-left">{t3({ en: "Strat", fr: "Strat" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Label", fr: "Libellé" })}</th>
                  <th class="p-2 text-left">{t3({ en: "Equity Dimension", fr: "Dimension d'équité" })}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr class="border-b">
                    <td class="p-2 font-mono text-xs">{d.strat}</td>
                    <td class="p-2">{d.label}</td>
                    <td class="p-2">
                      {d.isEquityDimension
                        ? t3({ en: "Yes", fr: "Oui" })
                        : t3({ en: "No", fr: "Non" })}
                    </td>
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
