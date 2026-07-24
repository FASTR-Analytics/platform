import {
  t3,
  TC,
  type HfaCsvMappingParams,
  type HfaDedupOverride,
  type HfaDuplicateGroup,
} from "lib";
import {
  Button,
  RadioGroup,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";

type Props = {
  step2Result: HfaCsvMappingParams;
  silentFetch: () => Promise<void>;
};

export function Step3(p: Props) {
  // An old saved step2Result (from before the filter/dedup deploy) gets the
  // same defaults the staging worker falls back to
  const [tempDedup, setTempDedup] = createStore<{
    dedupStrategy: "first" | "last";
    dedupOverrides: HfaDedupOverride[];
  }>({
    dedupStrategy: p.step2Result.dedupStrategy ?? "first",
    dedupOverrides: structuredClone(p.step2Result.dedupOverrides ?? []),
  });

  const preview = createQuery(
    () => serverActions.getDatasetHfaDuplicatePreview({}),
    t3({
      en: "Scanning for duplicate facilities...",
      fr: "Recherche d'établissements en double...",
      pt: "A procurar estabelecimentos duplicados...",
    }),
  );

  function rulePick(group: HfaDuplicateGroup): number {
    return tempDedup.dedupStrategy === "first"
      ? group.rows[0]
      : group.rows[group.rows.length - 1];
  }

  function setPick(group: HfaDuplicateGroup, keepRow: number) {
    const withoutGroup = tempDedup.dedupOverrides.filter(
      (o) => o.facilityId !== group.facilityId,
    );
    setTempDedup(
      "dedupOverrides",
      keepRow === rulePick(group)
        ? withoutGroup
        : [...withoutGroup, { facilityId: group.facilityId, keepRow }],
    );
  }

  const save = createFormAction(async () => {
    return serverActions.updateDatasetHfaMappings({
      mappings: {
        facilityIdColumn: p.step2Result.facilityIdColumn,
        timePoint: p.step2Result.timePoint,
        rowFilters: p.step2Result.rowFilters ?? [],
        dedupStrategy: tempDedup.dedupStrategy,
        dedupOverrides: unwrap(tempDedup).dedupOverrides,
      },
      reviewConfirmed: true,
    });
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="max-w-2xl space-y-6">
        <div>
          <h3 class="font-700 mb-2 text-lg">
            {t3({
              en: "Duplicates Review",
              fr: "Examen des doublons",
              pt: "Revisão dos duplicados",
            })}
          </h3>
          <div class="text-base-content-muted mb-3 text-sm">
            {t3({
              en: "Facilities with several rows after filtering: pick which row to keep for each. Row numbers count data rows from 1 in file order (the header row is excluded — add 1 to find the row in a spreadsheet).",
              fr: "Établissements ayant plusieurs lignes après filtrage : choisissez la ligne à conserver pour chacun. Les numéros de ligne comptent les lignes de données à partir de 1 dans l'ordre du fichier (ligne d'en-tête exclue — ajoutez 1 pour retrouver la ligne dans un tableur).",
              pt: "Estabelecimentos com várias linhas após a filtragem: escolha a linha a manter para cada um. Os números de linha contam as linhas de dados a partir de 1 na ordem do ficheiro (linha de cabeçalho excluída — adicione 1 para encontrar a linha numa folha de cálculo).",
            })}
          </div>
          <div class="ui-gap-sm mb-3 flex items-center">
            <span class="text-base-content-muted text-sm">
              {t3({
                en: "Quick-set all picks:",
                fr: "Réglage rapide de tous les choix :",
                pt: "Definição rápida de todas as escolhas:",
              })}
            </span>
            <Button
              size="sm"
              outline
              onClick={() =>
                setTempDedup({ dedupStrategy: "first", dedupOverrides: [] })
              }
            >
              {t3({
                en: "First row",
                fr: "Première ligne",
                pt: "Primeira linha",
              })}
            </Button>
            <Button
              size="sm"
              outline
              onClick={() =>
                setTempDedup({ dedupStrategy: "last", dedupOverrides: [] })
              }
            >
              {t3({ en: "Last row", fr: "Dernière ligne", pt: "Última linha" })}
            </Button>
          </div>
          <StateHolderWrapper state={preview.state()}>
            {(data) => (
              <div class="ui-spy-sm">
                <Show when={data.nRowsFilteredOut > 0}>
                  <div class="text-base-content-muted text-sm">
                    {t3({
                      en: "Rows removed by filter",
                      fr: "Lignes supprimées par le filtre",
                      pt: "Linhas removidas pelo filtro",
                    })}
                    : {data.nRowsFilteredOut}
                  </div>
                </Show>
                <Show
                  when={data.groups.length > 0}
                  fallback={
                    <div class="text-success text-sm">
                      {t3({
                        en: "No duplicate facilities after filtering.",
                        fr: "Aucun établissement en double après filtrage.",
                        pt: "Nenhum estabelecimento duplicado após a filtragem.",
                      })}
                    </div>
                  }
                >
                  <For each={data.groups}>
                    {(group) => {
                      const selected = () => {
                        const override = tempDedup.dedupOverrides.find(
                          (o) => o.facilityId === group.facilityId,
                        );
                        return String(override?.keepRow ?? rulePick(group));
                      };
                      return (
                        <div class="ui-gap flex items-center">
                          <div class="w-40 flex-none font-mono">
                            {group.facilityId}
                          </div>
                          <RadioGroup
                            value={selected()}
                            options={group.rows.map((r) => ({
                              value: String(r),
                              label: `${t3({ en: "Row", fr: "Ligne", pt: "Linha" })} ${r}`,
                            }))}
                            onChange={(val) => setPick(group, Number(val))}
                            horizontal
                          />
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </div>
            )}
          </StateHolderWrapper>
        </div>
      </div>
      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t3(TC.save)}
        </Button>
      </div>
    </div>
  );
}
