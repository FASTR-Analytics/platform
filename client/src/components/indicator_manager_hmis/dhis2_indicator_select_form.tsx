import {
  t3,
  type Dhis2Credentials,
  type DHIS2Indicator,
  type DHIS2DataElement,
  type DHIS2CategoryOptionCombo,
} from "lib";
import {
  FrameTop,
  HeaderBarCanGoBack,
  TextArea,
  Button,
  StateHolderFormError,
  timActionForm,
  type EditorComponentProps,
  timActionButton,
} from "panther";
import { createSignal, Show, For } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = EditorComponentProps<
  {
    credentials: Dhis2Credentials;
  },
  undefined
>;

type SelectedItem = {
  id: string;
  name: string;
  type: "indicator" | "dataElement" | "dataElementOperand";
};

type SearchResults = {
  indicators: DHIS2Indicator[];
  dataElements: DHIS2DataElement[];
};

export function Dhis2IndicatorSelectForm(p: Props) {
  const [tempSearchQuery, setTempSearchQuery] = createSignal<string>("");
  const [searchResults, setSearchResults] = createSignal<SearchResults>({
    indicators: [],
    dataElements: [],
  });
  const [hasSearched, setHasSearched] = createSignal<boolean>(false);
  const [tempSelectedElements, setTempSelectedElements] = createSignal<
    SelectedItem[]
  >([]);
  const [expandedDataElements, setExpandedDataElements] = createSignal<
    Set<string>
  >(new Set());

  const search = timActionForm(async () => {
    const query = tempSearchQuery().trim();
    if (!query) {
      return {
        success: false,
        err: t3({
          en: "Search query is required",
          fr: "La requête de recherche est requise",
        }),
      };
    }

    const response = await serverActions.searchDhis2All({
      dhis2Credentials: p.credentials,
      query,
      includeDataElements: true,
      includeIndicators: true,
    });

    if (!response.success) {
      return {
        success: false,
        err:
          response.err ||
          t3({ en: "Search failed", fr: "Échec de la recherche" }),
      };
    }

    setSearchResults({
      indicators: response.data.indicators,
      dataElements: response.data.dataElements,
    });
    setHasSearched(true);
    return response;
  });

  const save = timActionButton(
    async () => {
      const selectedItems = tempSelectedElements();
      if (selectedItems.length === 0) {
        return {
          success: false,
          err: t3({ en: "No items selected", fr: "Aucun élément sélectionné" }),
        };
      }

      const newRawIndicators = selectedItems.map((item) => {
        return {
          indicator_raw_id: item.id,
          indicator_raw_label: item.name,
          mapped_common_ids: [],
        };
      });

      return await serverActions.createRawIndicators({
        indicators: newRawIndicators,
      });
    },
    () => p.close(undefined),
  );

  function addToSelection(item: SelectedItem) {
    const isAlreadySelected = tempSelectedElements().some(
      (selected) => selected.id === item.id,
    );
    if (!isAlreadySelected) {
      setTempSelectedElements((prev) => [...prev, item]);
    }
  }

  function removeFromSelection(itemId: string) {
    setTempSelectedElements((prev) =>
      prev.filter((item) => item.id !== itemId),
    );
  }

  function isItemSelected(itemId: string): boolean {
    return tempSelectedElements().some((item) => item.id === itemId);
  }

  function toggleExpanded(dataElementId: string) {
    setExpandedDataElements((prev) => {
      const next = new Set(prev);
      if (next.has(dataElementId)) {
        next.delete(dataElementId);
      } else {
        next.add(dataElementId);
      }
      return next;
    });
  }

  function isExpanded(dataElementId: string): boolean {
    return expandedDataElements().has(dataElementId);
  }

  function hasDisaggregation(de: DHIS2DataElement): boolean {
    return (
      de.categoryCombo?.isDefault !== true &&
      (de.categoryCombo?.categoryOptionCombos?.length ?? 0) > 0
    );
  }

  function getCOCs(de: DHIS2DataElement): DHIS2CategoryOptionCombo[] {
    return de.categoryCombo?.categoryOptionCombos ?? [];
  }

  function totalResultCount(): number {
    return (
      searchResults().indicators.length + searchResults().dataElements.length
    );
  }

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({
            en: "DHIS2 Indicator Selection",
            fr: "Sélection d'indicateurs DHIS2",
          })}
          back={() => p.close(undefined)}
        >
          <Button
            onClick={save.click}
            state={save.state()}
            iconName="save"
            intent="success"
            disabled={tempSelectedElements().length === 0}
          >
            {t3({ en: "Save Selected", fr: "Enregistrer la sélection" })} (
            {tempSelectedElements().length})
          </Button>
        </HeaderBarCanGoBack>
      }
    >
      <div class="flex h-full w-full">
        <div class="ui-pad ui-spy flex h-full w-0 flex-1 flex-col">
          {/* Search Section */}
          <div class="w-full flex-none">
            <div class="font-700 mb-4 text-lg">
              {t3({
                en: "Search Indicators & Data Elements",
                fr: "Rechercher des indicateurs et éléments de données",
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                search.click();
              }}
              class="ui-gap flex items-end justify-start"
            >
              <div class="w-0 flex-1">
                <TextArea
                  value={tempSearchQuery()}
                  onChange={setTempSearchQuery}
                  placeholder={t3({
                    en: 'e.g. Antenatal care (searches for "Antenatal care" as one term)\ne.g. BFeLG7TNOvq, CKCRDq0NBHy (searches for two IDs and combines results)\n\nUse commas, semicolons, or new lines to search multiple terms at once.',
                    fr: "ex. Soins prénatals (recherche « Soins prénatals » comme un seul terme)\nex. BFeLG7TNOvq, CKCRDq0NBHy (recherche deux ID et combine les résultats)\n\nUtilisez des virgules, points-virgules ou retours à la ligne pour rechercher plusieurs termes.",
                  })}
                  label={t3({
                    en: "Search by name, code, or ID",
                    fr: "Rechercher par nom, code ou ID",
                  })}
                  rows={5}
                  fullWidth
                />
              </div>
              <div class="ui-gap-sm flex flex-col">
                <Button
                  type="submit"
                  state={search.state()}
                  iconName="search"
                  intent="primary"
                >
                  {t3({ en: "Search", fr: "Recherche" })}
                </Button>
                <Show when={tempSearchQuery().trim().length > 0}>
                  <Button
                    onClick={() => setTempSearchQuery("")}
                    iconName="x"
                    intent="neutral"
                    outline
                  >
                    {t3({ en: "Clear", fr: "Effacer" })}
                  </Button>
                </Show>
              </div>
            </form>
            <StateHolderFormError state={search.state()} />
          </div>

          {/* Results Section */}
          <Show when={hasSearched()}>
            <Show when={search.state().status === "ready"}>
              <div class="border-success bg-success/10 ui-pad-sm w-full flex-none rounded border">
                <div class="text-success font-700">
                  {t3({ en: "Search completed:", fr: "Recherche terminée :" })}{" "}
                  {totalResultCount()}{" "}
                  {t3({ en: "results found", fr: "résultats trouvés" })}
                </div>
              </div>
            </Show>
            <Show
              when={totalResultCount() > 0}
              fallback={
                <div class="border-base-300 bg-base-200 ui-pad rounded border text-center">
                  <div class="text-base-content">
                    {t3({
                      en: "No results found. Try a different search term.",
                      fr: "Aucun résultat trouvé. Essayez un autre terme de recherche.",
                    })}
                  </div>
                </div>
              }
            >
              <div class="h-0 w-full flex-1 overflow-auto">
                <div class="ui-spy-sm">
                  {/* Indicators */}
                  <For each={searchResults().indicators}>
                    {(indicator) => (
                      <div class="border-base-300 ui-pad-sm flex items-center gap-2 rounded border">
                        <span class="bg-primary/10 text-primary font-400 inline-block flex-none rounded px-2 py-1 text-xs">
                          {t3({ en: "Indicator", fr: "Indicateur" })}
                        </span>
                        <span class="font-700 flex-1 truncate">
                          {indicator.name}
                        </span>
                        <span class="text-base-content flex-none font-mono text-xs">
                          {indicator.id}
                        </span>
                        <Button
                          onClick={() =>
                            addToSelection({
                              id: indicator.id,
                              name: indicator.name,
                              type: "indicator",
                            })
                          }
                          iconName="plus"
                          intent="base-100"
                          disabled={isItemSelected(indicator.id)}
                        >
                          {isItemSelected(indicator.id)
                            ? t3({ en: "Added", fr: "Ajouté" })
                            : t3({ en: "Add", fr: "Ajouter" })}
                        </Button>
                      </div>
                    )}
                  </For>

                  {/* Data Elements */}
                  <For each={searchResults().dataElements}>
                    {(de) => (
                      <div class="border-base-300 rounded border">
                        {/* Data Element row */}
                        <div class="ui-pad-sm flex items-center gap-2">
                          <Show when={hasDisaggregation(de)}>
                            <Button
                              onClick={() => toggleExpanded(de.id)}
                              iconName={
                                isExpanded(de.id)
                                  ? "chevronDown"
                                  : "chevronRight"
                              }
                              intent="neutral"
                              outline
                            />
                          </Show>
                          <span class="bg-success/10 text-success font-400 inline-block flex-none rounded px-2 py-1 text-xs">
                            {t3({
                              en: "Data Element",
                              fr: "Élément de données",
                            })}
                          </span>
                          <span class="font-700 flex-1 truncate">
                            {de.name}
                          </span>
                          <Show when={hasDisaggregation(de)}>
                            <span class="bg-warning/10 text-warning flex-none rounded px-2 py-0.5 text-xs">
                              {getCOCs(de).length}{" "}
                              {t3({
                                en: "COCs",
                                fr: "COCs",
                              })}
                            </span>
                          </Show>
                          <span class="text-base-content flex-none font-mono text-xs">
                            {de.id}
                          </span>
                          <Button
                            onClick={() =>
                              addToSelection({
                                id: de.id,
                                name: de.name,
                                type: "dataElement",
                              })
                            }
                            iconName="plus"
                            intent="base-100"
                            disabled={isItemSelected(de.id)}
                          >
                            {isItemSelected(de.id)
                              ? t3({ en: "Added", fr: "Ajouté" })
                              : t3({ en: "Add", fr: "Ajouter" })}
                          </Button>
                        </div>

                        {/* Expanded COCs */}
                        <Show when={hasDisaggregation(de) && isExpanded(de.id)}>
                          <div class="border-base-300 bg-base-50 border-t">
                            <For each={getCOCs(de)}>
                              {(coc) => {
                                const operandId = `${de.id}.${coc.id}`;
                                const operandLabel = `${de.name} - ${coc.displayName || coc.name}`;
                                return (
                                  <div class="border-base-200 ui-pad-sm flex items-center gap-2 border-b pl-10 last:border-b-0">
                                    <span class="bg-info/10 text-info font-400 inline-block flex-none rounded px-2 py-1 text-xs">
                                      {t3({ en: "COC", fr: "COC" })}
                                    </span>
                                    <span class="font-500 flex-1 truncate">
                                      {coc.displayName || coc.name}
                                    </span>
                                    <span class="text-base-content flex-none font-mono text-xs">
                                      {operandId}
                                    </span>
                                    <Button
                                      onClick={() =>
                                        addToSelection({
                                          id: operandId,
                                          name: operandLabel,
                                          type: "dataElementOperand",
                                        })
                                      }
                                      iconName="plus"
                                      intent="base-100"
                                      disabled={isItemSelected(operandId)}
                                    >
                                      {isItemSelected(operandId)
                                        ? t3({ en: "Added", fr: "Ajouté" })
                                        : t3({ en: "Add", fr: "Ajouter" })}
                                    </Button>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
        </div>

        {/* Selected Items Panel */}
        <div class="ui-pad border-base-300 h-full w-0 flex-1 overflow-auto border-l">
          <div class="mb-4">
            <div class="font-700 text-lg">
              {t3({ en: "Selected Items", fr: "Éléments sélectionnés" })}
            </div>
            <Show when={tempSelectedElements().length > 0}>
              <div class="text-base-content text-sm">
                {tempSelectedElements().length}{" "}
                {t3({ en: "items selected", fr: "éléments sélectionnés" })}
              </div>
            </Show>
          </div>
          <Show
            when={tempSelectedElements().length > 0}
            fallback={
              <div class="text-neutral text-sm">
                {t3({
                  en: "No items selected. Search for items and click 'Add' from search results.",
                  fr: "Aucun élément sélectionné. Recherchez des éléments et cliquez sur « Ajouter » dans les résultats.",
                })}
              </div>
            }
          >
            <div class="ui-spy">
              <For each={tempSelectedElements()}>
                {(item) => (
                  <div class="border-base-300 ui-pad-sm ui-gap flex items-center justify-between rounded border">
                    <div class="flex-1">
                      <div class="font-700">{item.name}</div>
                      <div class="ui-gap-sm flex items-center text-sm">
                        <span
                          class={`font-400 inline-block rounded px-2 py-1 text-xs ${
                            item.type === "indicator"
                              ? "bg-primary/10 text-primary"
                              : item.type === "dataElementOperand"
                                ? "bg-info/10 text-info"
                                : "bg-success/10 text-success"
                          }`}
                        >
                          {item.type === "indicator"
                            ? t3({ en: "Indicator", fr: "Indicateur" })
                            : item.type === "dataElementOperand"
                              ? t3({ en: "Operand", fr: "Opérande" })
                              : t3({
                                  en: "Data Element",
                                  fr: "Élément de données",
                                })}
                        </span>
                        <span class="font-mono text-xs">{item.id}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => removeFromSelection(item.id)}
                      iconName="x"
                      intent="danger"
                      outline
                    >
                      {t3({ en: "Remove", fr: "Retirer" })}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </FrameTop>
  );
}
