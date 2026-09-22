// Add indicators from DHIS2 (PLAN_A5 ruling 7, PLAN_A3 ruling 8): search
// data elements and DHIS2 indicators, refuse the ineligible ones in the
// list with the reason,
// then name what the selection becomes and save it in one transaction. An
// element or operand becomes a DHIS2 element indicator carrying its UID as
// its DHIS2 id; a DHIS2 indicator is decomposed into its operands and a
// calculated over the indicators they become. The server re-reads every
// element and indicator and judges them itself.
import {
  describeDhis2ParseRefusal,
  describeDhis2ElementRefusal,
  t3,
  type Dhis2DataElementSearchItem,
  type Dhis2IndicatorSearchItem,
  type DHIS2CategoryOptionCombo,
  dhis2ElementName,
  type HmisIndicator,
} from "lib";
import {
  Badge,
  Callout,
  FrameTop,
  HeadingBar,
  TextArea,
  Button,
  StateHolderFormError,
  createFormAction,
  type EditorComponentProps,
  type Intent,
  createButtonAction,
} from "panther";
import { batch, createMemo, createSignal, Match, Show, Switch, For } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  createNamingState,
  namingInputFromState,
  namingIssues,
  NamingStep,
  EMPTY_NAMING_STATE,
  type NamingCalculatedCandidate,
  type NamingElementCandidate,
  type NamingState,
} from "./naming_step";

type Props = EditorComponentProps<{}, undefined>;

type SelectedItem =
  | { kind: "element"; element: Dhis2DataElementSearchItem }
  | {
    kind: "operand";
    element: Dhis2DataElementSearchItem;
    coc: DHIS2CategoryOptionCombo;
  }
  | { kind: "indicator"; indicator: Dhis2IndicatorSearchItem };

type SearchResults = {
  indicators: Dhis2IndicatorSearchItem[];
  dataElements: Dhis2DataElementSearchItem[];
};

function operandId(elementId: string, coc: DHIS2CategoryOptionCombo): string {
  return `${elementId}.${coc.id}`;
}

function cocName(coc: DHIS2CategoryOptionCombo): string {
  return coc.displayName || coc.name;
}

function itemId(item: SelectedItem): string {
  switch (item.kind) {
    case "element":
      return item.element.id;
    case "operand":
      return operandId(item.element.id, item.coc);
    case "indicator":
      return item.indicator.id;
  }
}

function itemName(item: SelectedItem): string {
  switch (item.kind) {
    case "element":
      return item.element.name;
    case "operand":
      return dhis2ElementName(item.element, operandId(item.element.id, item.coc));
    case "indicator":
      return item.indicator.name;
  }
}

function elementRefusal(de: Dhis2DataElementSearchItem): string | undefined {
  if (de.verdict.accepted) return undefined;
  return `${t3({
    en: "Cannot be added:",
    fr: "Ne peut pas être ajouté :",
    pt: "Não pode ser adicionado:",
  })} ${t3(describeDhis2ElementRefusal(de.verdict.refusal))}`;
}

function indicatorRefusal(
  indicator: Dhis2IndicatorSearchItem,
): string | undefined {
  const { parse, operands } = indicator.decomposition;
  if (!parse.accepted) {
    return `${t3({
      en: "Cannot be decomposed:",
      fr: "Ne peut pas être décomposé :",
      pt: "Não pode ser decomposto:",
    })} ${t3(describeDhis2ParseRefusal(parse.refusal))}`;
  }
  const refused = operands.find((o) => !o.verdict.accepted);
  if (refused !== undefined && !refused.verdict.accepted) {
    return `${t3({
      en: `Operand ${refused.data_id} cannot be added:`,
      fr: `L'opérande ${refused.data_id} ne peut pas être ajouté :`,
      pt: `O operando ${refused.data_id} não pode ser adicionado:`,
    })} ${t3(describeDhis2ElementRefusal(refused.verdict.refusal))}`;
  }
  return undefined;
}

function kindLabel(kind: SelectedItem["kind"]): string {
  switch (kind) {
    case "indicator":
      return t3({ en: "Indicator", fr: "Indicateur", pt: "Indicador" });
    case "operand":
      return t3({ en: "Operand", fr: "Opérande", pt: "Operando" });
    case "element":
      return t3({
        en: "Data element",
        fr: "Élément de données",
        pt: "Elemento de dados",
      });
  }
}

function kindIntent(kind: SelectedItem["kind"]): Intent {
  switch (kind) {
    case "indicator":
      return "primary";
    case "operand":
      return "neutral";
    case "element":
      return "success";
  }
}

export function Dhis2IndicatorSelectForm(p: Props) {
  const [tempSearchQuery, setTempSearchQuery] = createSignal<string>("");
  const [searchResults, setSearchResults] = createSignal<SearchResults>({
    indicators: [],
    dataElements: [],
  });
  const [hasSearched, setHasSearched] = createSignal<boolean>(false);
  const [selected, setSelected] = createSignal<SelectedItem[]>([]);
  const [expandedDataElements, setExpandedDataElements] = createSignal<
    Set<string>
  >(new Set());
  const [phase, setPhase] = createSignal<"select" | "name">("select");
  const [dictionary, setDictionary] = createSignal<HmisIndicator[]>([]);
  const [naming, setNaming] = createStore<NamingState>(
    structuredClone(EMPTY_NAMING_STATE),
  );

  const search = createFormAction(async () => {
    const query = tempSearchQuery().trim();
    if (!query) {
      return {
        success: false,
        err: t3({
          en: "Search query is required",
          fr: "La requête de recherche est requise",
          pt: "O termo de pesquisa é obrigatório",
        }),
      };
    }

    const response = await serverActions.searchDhis2All({
      query,
      includeDataElements: true,
      includeIndicators: true,
    });

    if (!response.success) {
      return {
        success: false,
        err:
          response.err ||
          t3({ en: "Search failed", fr: "Échec de la recherche", pt: "Falha na pesquisa" }),
      };
    }

    batch(() => {
      setSearchResults({
        indicators: response.data.indicators,
        dataElements: response.data.dataElements,
      });
      setHasSearched(true);
    });
    return response;
  });

  // Every operand of a selected indicator is a candidate element too. Its
  // label comes from the element (with the COC's name for an operand); an
  // element the search did not return is looked up by id first.
  async function operandLabels(
    ids: string[],
  ): Promise<Map<string, string>> {
    const elements = new Map(
      searchResults().dataElements.map((de) => [de.id, de]),
    );
    const missing = [
      ...new Set(
        ids.map((id) => id.split(".")[0]).filter((id) => !elements.has(id)),
      ),
    ];
    if (missing.length > 0) {
      const res = await serverActions.searchDhis2All({
        query: missing.join(","),
        includeDataElements: true,
        includeIndicators: false,
      });
      if (res.success) {
        for (const de of res.data.dataElements) elements.set(de.id, de);
      }
    }
    const labels = new Map<string, string>();
    for (const id of ids) {
      const element = elements.get(id.split(".")[0]);
      labels.set(id, element === undefined ? id : dhis2ElementName(element, id));
    }
    return labels;
  }

  const toNaming = createFormAction(async () => {
    const items = selected();
    if (items.length === 0) {
      return {
        success: false,
        err: t3({ en: "No items selected", fr: "Aucun élément sélectionné", pt: "Nenhum elemento selecionado" }),
      };
    }
    const dictionaryRes = await serverActions.getIndicators({});
    if (!dictionaryRes.success) {
      return dictionaryRes;
    }
    const elements = new Map<string, NamingElementCandidate>();
    const operandIds: string[] = [];
    const calculated: NamingCalculatedCandidate[] = [];
    for (const item of items) {
      if (item.kind !== "indicator") {
        elements.set(itemId(item), {
          data_id: itemId(item),
          data_label: itemName(item),
        });
        continue;
      }
      const { parse, operands } = item.indicator.decomposition;
      if (!parse.accepted) continue;
      for (const operand of operands) operandIds.push(operand.data_id);
      calculated.push({
        key: item.indicator.id,
        label: item.indicator.name,
        expression: parse.expression,
        format_as: parse.format_as,
        note: parse.note === undefined ? undefined : t3(parse.note),
      });
    }
    const labels = await operandLabels(
      operandIds.filter((id) => !elements.has(id)),
    );
    for (const id of operandIds) {
      if (!elements.has(id)) {
        elements.set(id, { data_id: id, data_label: labels.get(id) ?? id });
      }
    }
    batch(() => {
      setDictionary(dictionaryRes.data.indicators);
      setNaming(
        createNamingState({
          elements: [...elements.values()],
          calculated,
          indicators: dictionaryRes.data.indicators,
        }),
      );
      setPhase("name");
    });
    return { success: true };
  });

  const issues = createMemo(() =>
    phase() === "name" ? namingIssues(naming, dictionary()) : []
  );

  const save = createButtonAction(
    async () => {
      return await serverActions.createIndicatorsFromDhis2({
        elements: namingInputFromState(naming).elements,
        indicators: naming.calculated.map((row) => ({
          uid: row.key,
          indicator_id: row.indicator_id.trim(),
          label: row.label.trim(),
        })),
      });
    },
    () => p.close(undefined),
  );

  function addToSelection(item: SelectedItem) {
    const id = itemId(item);
    if (!selected().some((s) => itemId(s) === id)) {
      setSelected((prev) => [...prev, item]);
    }
  }

  function removeFromSelection(id: string) {
    setSelected((prev) => prev.filter((item) => itemId(item) !== id));
  }

  function isItemSelected(id: string): boolean {
    return selected().some((item) => itemId(item) === id);
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

  function hasDisaggregation(de: Dhis2DataElementSearchItem): boolean {
    return (
      de.categoryCombo?.isDefault !== true &&
      (de.categoryCombo?.categoryOptionCombos?.length ?? 0) > 0
    );
  }

  function getCOCs(de: Dhis2DataElementSearchItem): DHIS2CategoryOptionCombo[] {
    return de.categoryCombo?.categoryOptionCombos ?? [];
  }

  function totalResultCount(): number {
    return (
      searchResults().indicators.length + searchResults().dataElements.length
    );
  }

  function addButton(item: SelectedItem, refusal: string | undefined) {
    const id = itemId(item);
    return (
      <Button
        onClick={() => addToSelection(item)}
        iconName="plus"
        intent="base-100"
        disabled={isItemSelected(id) || refusal !== undefined}
      >
        {isItemSelected(id)
          ? t3({ en: "Added", fr: "Ajouté", pt: "Adicionado" })
          : t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
      </Button>
    );
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={phase() === "select"
            ? t3({
              en: "Add indicators from DHIS2",
              fr: "Ajouter des indicateurs depuis DHIS2",
              pt: "Adicionar indicadores do DHIS2",
            })
            : t3({
              en: "Name the new indicators",
              fr: "Nommer les nouveaux indicateurs",
              pt: "Nomear os novos indicadores",
            })}
          onBack={() => phase() === "select" ? p.close(undefined) : setPhase("select")}
        >
          <Switch>
            <Match when={phase() === "select"}>
              <Button
                onClick={toNaming.click}
                state={toNaming.state()}
                iconName="arrowRight"
                intent="primary"
                disabled={selected().length === 0}
              >
                {t3({ en: "Next: name indicators", fr: "Suivant : nommer les indicateurs", pt: "Seguinte: nomear indicadores" })} (
                {selected().length})
              </Button>
            </Match>
            <Match when={phase() === "name"}>
              <Button
                onClick={save.click}
                state={save.state()}
                iconName="save"
                intent="success"
                disabled={issues().length > 0}
              >
                {t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" })}
              </Button>
            </Match>
          </Switch>
        </HeadingBar>
      }
    >
      <Show when={phase() === "name"}>
        <div class="ui-pad h-full w-full overflow-auto">
          <div class="mx-auto max-w-5xl">
            <NamingStep state={naming} setState={setNaming} indicators={dictionary()} />
          </div>
        </div>
      </Show>
      <Show when={phase() === "select"}>
        <div class="flex h-full w-full">
          <div class="ui-pad ui-spy flex h-full w-0 flex-1 flex-col">
            <div class="w-full flex-none">
              <div class="ui-text-heading mb-4">
                {t3({
                  en: "Search indicators and data elements",
                  fr: "Rechercher des indicateurs et éléments de données",
                  pt: "Pesquisar indicadores e elementos de dados",
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
                      pt: "p. ex. Cuidados pré-natais (pesquisa «Cuidados pré-natais» como um único termo)\np. ex. BFeLG7TNOvq, CKCRDq0NBHy (pesquisa dois IDs e combina os resultados)\n\nUtilize vírgulas, pontos e vírgulas ou novas linhas para pesquisar vários termos de uma só vez.",
                    })}
                    label={t3({
                      en: "Search by name, code, or ID",
                      fr: "Rechercher par nom, code ou ID",
                      pt: "Pesquisar por nome, código ou ID",
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
                    {t3({ en: "Search", fr: "Recherche", pt: "Pesquisar" })}
                  </Button>
                  <Show when={tempSearchQuery().trim().length > 0}>
                    <Button
                      onClick={() => setTempSearchQuery("")}
                      iconName="x"
                      intent="neutral"
                      outline
                    >
                      {t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
                    </Button>
                  </Show>
                </div>
              </form>
              <StateHolderFormError state={search.state()} />
            </div>

            <Show when={hasSearched()}>
              <Show when={search.state().status === "ready"}>
                <Callout intent="success" pad="sm" class="w-full flex-none">
                  <div class="font-700">
                    {t3({ en: "Search completed:", fr: "Recherche terminée :", pt: "Pesquisa concluída:" })}{" "}
                    {totalResultCount()}{" "}
                    {t3({ en: "results found", fr: "résultats trouvés", pt: "resultados encontrados" })}
                  </div>
                </Callout>
              </Show>
              <Show
                when={totalResultCount() > 0}
                fallback={
                  <div class="bg-base-200 ui-pad rounded border text-center">
                    <div class="text-base-content">
                      {t3({
                        en: "No results found. Try a different search term.",
                        fr: "Aucun résultat trouvé. Essayez un autre terme de recherche.",
                        pt: "Nenhum resultado encontrado. Experimente outro termo de pesquisa.",
                      })}
                    </div>
                  </div>
                }
              >
                <div class="h-0 w-full flex-1 overflow-auto">
                  <div class="ui-spy-sm">
                    <For each={searchResults().indicators}>
                      {(indicator) => {
                        const refusal = indicatorRefusal(indicator);
                        return (
                          <div class="ui-pad-sm rounded border">
                            <div class="ui-gap-sm flex items-center">
                              <span class="flex-none">
                                <Badge intent={kindIntent("indicator")}>
                                  {kindLabel("indicator")}
                                </Badge>
                              </span>
                              <span class="font-700 flex-1 truncate">
                                {indicator.name}
                              </span>
                              <span class="text-base-content flex-none font-mono text-xs">
                                {indicator.id}
                              </span>
                              {addButton({ kind: "indicator", indicator }, refusal)}
                            </div>
                            <Show
                              when={refusal}
                              fallback={
                                <div class="text-base-content-muted mt-1 font-mono text-xs">
                                  {indicator.numerator} / {indicator.denominator}
                                </div>
                              }
                            >
                              {(text) => <div class="text-danger mt-1 text-xs">{text()}</div>}
                            </Show>
                          </div>
                        );
                      }}
                    </For>

                    <For each={searchResults().dataElements}>
                      {(de) => {
                        const refusal = elementRefusal(de);
                        return (
                          <div class="rounded border">
                            <div class="ui-pad-sm">
                              <div class="ui-gap-sm flex items-center">
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
                                <span class="flex-none">
                                  <Badge intent={kindIntent("element")}>
                                    {kindLabel("element")}
                                  </Badge>
                                </span>
                                <span class="font-700 flex-1 truncate">
                                  {de.name}
                                </span>
                                <Show when={hasDisaggregation(de)}>
                                  <span class="flex-none">
                                    <Badge intent="warning">
                                      {getCOCs(de).length}{" "}
                                      {t3({ en: "COCs", fr: "COCs", pt: "COCs" })}
                                    </Badge>
                                  </span>
                                </Show>
                                <span class="text-base-content flex-none font-mono text-xs">
                                  {de.id}
                                </span>
                                {addButton({ kind: "element", element: de }, refusal)}
                              </div>
                              <Show when={refusal}>
                                {(text) => <div class="text-danger mt-1 text-xs">{text()}</div>}
                              </Show>
                            </div>

                            <Show when={hasDisaggregation(de) && isExpanded(de.id)}>
                              <div class="bg-base-200 border-t">
                                <For each={getCOCs(de)}>
                                  {(coc) => (
                                    <div class="ui-gap-sm ui-pad-sm flex items-center border-b pl-10 last:border-b-0">
                                      <span class="flex-none">
                                        <Badge intent="neutral">
                                          {t3({ en: "COC", fr: "COC", pt: "COC" })}
                                        </Badge>
                                      </span>
                                      <span class="font-400 flex-1 truncate">
                                        {cocName(coc)}
                                      </span>
                                      <span class="text-base-content flex-none font-mono text-xs">
                                        {operandId(de.id, coc)}
                                      </span>
                                      {addButton({ kind: "operand", element: de, coc }, refusal)}
                                    </div>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>
          </div>

          <div class="ui-pad h-full w-0 flex-1 overflow-auto border-l">
            <div class="mb-4">
              <div class="ui-text-heading">
                {t3({ en: "Selected items", fr: "Éléments sélectionnés", pt: "Elementos selecionados" })}
              </div>
              <Show when={selected().length > 0}>
                <div class="text-base-content text-sm">
                  {selected().length}{" "}
                  {t3({ en: "items selected", fr: "éléments sélectionnés", pt: "elementos selecionados" })}
                </div>
              </Show>
            </div>
            <Show
              when={selected().length > 0}
              fallback={
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "No items selected. Search for items and click 'Add' from search results.",
                    fr: "Aucun élément sélectionné. Recherchez des éléments et cliquez sur « Ajouter » dans les résultats.",
                    pt: "Nenhum elemento selecionado. Pesquise elementos e clique em «Adicionar» nos resultados.",
                  })}
                </div>
              }
            >
              <div class="ui-spy">
                <For each={selected()}>
                  {(item) => (
                    <div class="ui-pad-sm ui-gap flex items-center justify-between rounded border">
                      <div class="flex-1">
                        <div class="font-700">{itemName(item)}</div>
                        <div class="ui-gap-sm flex items-center text-sm">
                          <Badge intent={kindIntent(item.kind)}>
                            {kindLabel(item.kind)}
                          </Badge>
                          <span class="font-mono text-xs">{itemId(item)}</span>
                        </div>
                      </div>
                      <Button
                        onClick={() => removeFromSelection(itemId(item))}
                        iconName="x"
                        intent="danger"
                        outline
                      >
                        {t3({ en: "Remove", fr: "Retirer", pt: "Remover" })}
                      </Button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
      <StateHolderFormError state={toNaming.state()} />
    </FrameTop>
  );
}
