import {
  t3,
  TC,
  type CommonIndicatorType,
  type Dhis2RunCredentialsSource,
  INDICATOR_BATCH_FILE_COLUMNS,
  INDICATOR_BATCH_SOURCES_SEPARATOR,
  type IndicatorWithSources,
  type InstanceIndicatorDetails,
  isSpecialIndicatorId,
  judgeDerivedIndicators,
  POPULATION_TYPE_IDS,
  populationTypeLabel,
  RESERVED_WORDS,
  SPECIAL_INDICATORS,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  FrameTop,
  HeadingBar,
  getQueryStateFromApiResponse,
  StateHolderWrapper,
  Table,
  TableColumn,
  getEditorWrapper,
  openComponent,
  createDeleteAction,
  type BulkAction,
  type StateHolder,
} from "panther";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getIndicatorsFromCacheOrFetch } from "~/state/instance/t2_indicators";
import { Dhis2CredentialsForm } from "../forms_editors/dhis2_credentials_form";
import {
  computabilityProblemText,
  missingPopulationText,
} from "./_computability";
import { EditIndicatorForm } from "./_edit_indicator";
import { BatchUploadForm } from "./batch_upload_form";
import { Dhis2IndicatorSelectForm } from "./dhis2_indicator_select_form";
import { SortIndicatorsModal } from "./sort_indicators_modal";

type Props = {
  backToInstance: () => void;
};

// The dictionary as one list (PLAN_A3 ruling 1): base and derived
// indicators differ by a Type column, a base shows its sources, and a
// special indicator (one the analysis modules read by name) carries a badge.
export function IndicatorsManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [indicators, setIndicators] = createSignal<
    StateHolder<InstanceIndicatorDetails>
  >({
    status: "loading",
    msg: t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  });

  let indicatorsRequestId = 0;
  createEffect(async () => {
    const version = instanceState.indicatorMappingsVersion;
    if (!version) {
      return;
    }
    const requestId = ++indicatorsRequestId;
    setIndicators({ status: "loading" });
    const res = await getIndicatorsFromCacheOrFetch(version);
    if (requestId !== indicatorsRequestId) {
      return;
    }
    setIndicators(getQueryStateFromApiResponse(res));
  });

  // The batch file (ruling 11): the download mirrors the upload.
  function handleDownloadCsv(list: IndicatorWithSources[]) {
    const rows = list.map((indicator) => [
      indicator.indicator_common_id,
      indicator.indicator_common_label,
      indicator.definition.type,
      indicator.sources.map((s) => s.source_id).join(
        INDICATOR_BATCH_SOURCES_SEPARATOR,
      ),
      indicator.definition.type === "derived"
        ? indicator.definition.expression
        : "",
      indicator.format_as,
      indicator.thresholds ? JSON.stringify(indicator.thresholds) : "",
    ]);

    const csvContent = [
      INDICATOR_BATCH_FILE_COLUMNS.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "indicators.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBatchUpload() {
    await openEditor({
      element: BatchUploadForm,
      props: {},
    });
  }

  async function handleDhis2IndicatorSelect() {
    const infoRes = await serverActions.getInstanceDhis2CredentialsInfo({});
    let credentialsSource: Dhis2RunCredentialsSource;
    if (infoRes.success && infoRes.data.storedCredentials) {
      credentialsSource = { kind: "stored" };
    } else {
      const result = await openComponent({
        element: Dhis2CredentialsForm,
        props: {},
      });
      if (!result) {
        return;
      }
      credentialsSource = { kind: "inline", credentials: result.credentials };
    }

    await openEditor({
      element: Dhis2IndicatorSelectForm,
      props: { credentialsSource },
    });
  }

  async function handleReference() {
    await openComponent({ element: ReferenceListModal, props: {} });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={p.backToInstance}
            heading={t3({ en: "HMIS INDICATORS", fr: "INDICATEURS", pt: "INDICADORES" })}
          >
            <div class="ui-gap-sm flex items-center">
              <Button iconName="info" onClick={handleReference} outline onBackground="base-200">
                {t3({
                  en: "Special indicators and reserved words",
                  fr: "Indicateurs spéciaux et mots réservés",
                  pt: "Indicadores especiais e palavras reservadas",
                })}
              </Button>
              <Show when={instanceState.currentUserIsGlobalAdmin}>
                <Button iconName="import" onClick={handleDhis2IndicatorSelect}>
                  {t3({
                    en: "Import from DHIS2",
                    fr: "Importer depuis DHIS2",
                    pt: "Importar do DHIS2",
                  })}
                </Button>
                <Button iconName="upload" onClick={handleBatchUpload}>
                  {t3({
                    en: "Batch import from CSV",
                    fr: "Importation groupée depuis CSV",
                    pt: "Importação em lote a partir de CSV",
                  })}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        <div class="ui-pad ui-spy h-full w-full overflow-auto">
          <StateHolderWrapper state={indicators()} noPad>
            {(keyedIndicators) => (
              <div class="h-full">
                <IndicatorsTable
                  indicators={keyedIndicators.indicators}
                  handleDownloadCsv={handleDownloadCsv}
                />
              </div>
            )}
          </StateHolderWrapper>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

function indicatorTypeLabel(type: CommonIndicatorType): string {
  switch (type) {
    case "base":
      return t3({ en: "Base", fr: "De base", pt: "Base" });
    case "derived":
      return t3({ en: "Derived", fr: "Dérivé", pt: "Derivado" });
  }
}

// What the indicator is made of: its sources for a base indicator, the
// formula itself for a derived one. One derivation for display AND sort.
function definedByText(indicator: IndicatorWithSources): string {
  return indicator.definition.type === "base"
    ? indicator.sources.map((s) => s.source_id).join(", ")
    : indicator.definition.expression;
}

type IndicatorStatus = {
  problem: string | undefined;
  population: string | undefined;
};

function IndicatorsTable(p: {
  indicators: IndicatorWithSources[];
  handleDownloadCsv: (indicators: IndicatorWithSources[]) => void;
}) {
  // The same judgement capture makes, over the dictionary the list shows.
  // Base indicators have no status: one without sources is the ordinary case.
  const statuses = createMemo(() => {
    const judgements = judgeDerivedIndicators(
      p.indicators,
      POPULATION_TYPE_IDS,
    );
    const statuses = new Map<string, IndicatorStatus>();
    for (const [id, judgement] of judgements) {
      statuses.set(id, {
        problem: judgement.kind === "computable"
          ? undefined
          : computabilityProblemText(judgement),
        population: judgement.kind === "unresolvable"
          ? undefined
          : missingPopulationText(
            judgement.resolved,
            instanceState.populationCoverage,
          ),
      });
    }
    return statuses;
  });
  const statusOf = (indicator: IndicatorWithSources) =>
    statuses().get(indicator.indicator_common_id);
  const uncomputableCount = createMemo(
    () => [...statuses().values()].filter((s) => s.problem !== undefined).length,
  );

  async function handleCreateIndicator() {
    await openComponent({
      element: EditIndicatorForm,
      props: { indicators: p.indicators },
    });
  }

  async function handleUpdateIndicator(indicator: IndicatorWithSources) {
    await openComponent({
      element: EditIndicatorForm,
      props: { indicators: p.indicators, existingIndicator: indicator },
    });
  }

  async function handleSortIndicators() {
    await openComponent({
      element: SortIndicatorsModal,
      props: { indicators: p.indicators },
    });
  }

  async function handleDeleteIndicators(selected: IndicatorWithSources[]) {
    const indicatorIds = selected.map((i) => i.indicator_common_id);
    const deleteAction = createDeleteAction(
      {
        text: indicatorIds.length === 1
          ? t3({
            en: "Are you sure you want to delete this indicator? Its sources go with it.",
            fr: "Êtes-vous sûr de vouloir supprimer cet indicateur ? Ses sources seront supprimées avec lui.",
            pt: "Tem a certeza de que pretende eliminar este indicador? As suas fontes são eliminadas com ele.",
          })
          : t3({
            en: "Are you sure you want to delete these indicators? Their sources go with them.",
            fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs ? Leurs sources seront supprimées avec eux.",
            pt: "Tem a certeza de que pretende eliminar estes indicadores? As suas fontes são eliminadas com eles.",
          }),
        itemList: selected.map(
          (i) => `${i.indicator_common_id} ~ ${i.indicator_common_label}`,
        ),
      },
      () =>
        serverActions.deleteIndicators({ indicator_common_ids: indicatorIds }),
    );
    await deleteAction.click();
  }

  const columns: TableColumn<IndicatorWithSources>[] = [
    {
      key: "indicator_common_id",
      header: t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" }),
      sortable: true,
      render: (indicator) => (
        <span class="ui-gap-sm flex items-center">
          <span class="font-mono">{indicator.indicator_common_id}</span>
          <Show when={isSpecialIndicatorId(indicator.indicator_common_id)}>
            <span
              class="bg-primary-subtle text-primary-subtle-content rounded px-2 py-0.5 text-xs"
              title={t3({
                en: "Read by name by the analysis modules; must stay a base indicator",
                fr: "Lu par son identifiant par les modules d'analyse ; doit rester un indicateur de base",
                pt: "Lido pelo seu ID pelos módulos de análise; tem de permanecer um indicador de base",
              })}
            >
              {t3({ en: "Special", fr: "Spécial", pt: "Especial" })}
            </span>
          </Show>
        </span>
      ),
    },
    {
      key: "indicator_common_label",
      header: t3(TC.label),
      sortable: true,
    },
    {
      key: "definition",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: (indicator) => indicatorTypeLabel(indicator.definition.type),
      render: (indicator) => (
        <span class="">{indicatorTypeLabel(indicator.definition.type)}</span>
      ),
    },
    {
      key: "sources",
      header: t3({ en: "Defined by", fr: "Défini par", pt: "Definido por" }),
      sortable: true,
      sortValue: (indicator) => definedByText(indicator),
      render: (indicator) =>
        indicator.definition.type === "derived"
          ? <div class="font-mono">{indicator.definition.expression}</div>
          : (
            <div class="ui-spy-xs">
              <For each={indicator.sources}>
                {(source) => (
                  <div class="text-xs">
                    <span class="font-mono">{source.source_id}</span>
                    <Show when={source.source_label !== source.source_id}>
                      <span class="text-base-content-muted ml-2">
                        {source.source_label}
                      </span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          ),
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      sortValue: (indicator) => {
        const s = statusOf(indicator);
        return s?.problem ?? s?.population ?? "";
      },
      render: (indicator) => (
        <Show when={statusOf(indicator)}>
          {(s) => (
            <div class="text-xs">
              <Show when={s().problem}>
                {(problem) => (
                  <div class="text-danger font-700">{problem()}</div>
                )}
              </Show>
              <Show when={s().population}>
                {(population) => (
                  <div class="text-warning">{population()}</div>
                )}
              </Show>
            </div>
          )}
        </Show>
      ),
    },
  ];

  const allColumns = createMemo<TableColumn<IndicatorWithSources>[]>(() => {
    if (!instanceState.currentUserIsGlobalAdmin) return columns;
    return [
      ...columns,
      {
        key: "actions",
        header: "",
        alignH: "right",
        render: (indicator) => (
          <div class="ui-gap-sm flex justify-end">
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleUpdateIndicator(indicator);
              }}
              iconName="pencil"
              intent="base-100"
            />
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDeleteIndicators([indicator]);
              }}
              iconName="trash"
              intent="base-100"
            />
          </div>
        ),
      },
    ];
  });

  const bulkActions = createMemo<BulkAction<IndicatorWithSources>[]>(() =>
    instanceState.currentUserIsGlobalAdmin
      ? [
          {
            label: t3(TC.delete),
            intent: "danger",
            outline: true,
            onClick: handleDeleteIndicators,
          },
        ]
      : [],
  );

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" })}
        </div>
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <Button
            onClick={() => p.handleDownloadCsv(p.indicators)}
            iconName="download"
            intent="neutral"
          >
            {t3({ en: "Download CSV", fr: "Télécharger le CSV", pt: "Transferir o CSV" })}
          </Button>
          <Button
            onClick={handleSortIndicators}
            iconName="gripVertical"
            intent="neutral"
          >
            {t3({ en: "Sort", fr: "Trier", pt: "Ordenar" })}
          </Button>
          <Button
            onClick={handleCreateIndicator}
            iconName="plus"
            intent="primary"
          >
            {t3({
              en: "Create indicator",
              fr: "Créer un indicateur",
              pt: "Criar indicador",
            })}
          </Button>
        </Show>
      </div>
      <Show when={uncomputableCount() > 0}>
        <div class="bg-warning-subtle text-warning-subtle-content mb-4 flex-none rounded px-3 py-2 text-sm">
          {uncomputableCount() === 1
            ? t3({
                en: "1 derived indicator cannot be computed. Results cannot be generated until it is edited or removed, or the indicators it uses have sources.",
                fr: "1 indicateur dérivé ne peut pas être calculé. Les résultats ne pourront pas être générés tant qu'il n'est pas modifié ou supprimé, ou que les indicateurs qu'il utilise n'ont pas de sources.",
                pt: "1 indicador derivado não pode ser calculado. Os resultados não podem ser gerados até que seja editado ou removido, ou até que os indicadores que utiliza tenham fontes.",
              })
            : t3({
                en: `${uncomputableCount()} derived indicators cannot be computed. Results cannot be generated until they are edited or removed, or the indicators they use have sources.`,
                fr: `${uncomputableCount()} indicateurs dérivés ne peuvent pas être calculés. Les résultats ne pourront pas être générés tant qu'ils ne sont pas modifiés ou supprimés, ou que les indicateurs qu'ils utilisent n'ont pas de sources.`,
                pt: `${uncomputableCount()} indicadores derivados não podem ser calculados. Os resultados não podem ser gerados até que sejam editados ou removidos, ou até que os indicadores que utilizam tenham fontes.`,
              })}
        </div>
      </Show>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.indicators}
          columns={allColumns()}
          keyField="indicator_common_id"
          noRowsMessage={t3({
            en: "No indicators",
            fr: "Aucun indicateur",
            pt: "Nenhum indicador",
          })}
          bulkActions={bulkActions()}
          selectionLabel={t3({ en: "indicator", fr: "indicateur", pt: "indicador" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}

// The reference list (PLAN_A3 ruling 5): the special ids the analysis
// modules read by name, and every reserved word no indicator id may be.
function ReferenceListModal(p: AlertComponentProps<{}, undefined>) {
  return (
    <AlertFormHolder
      formId="indicator-reference"
      header={t3({
        en: "Special indicators and reserved words",
        fr: "Indicateurs spéciaux et mots réservés",
        pt: "Indicadores especiais e palavras reservadas",
      })}
      savingState={{ status: "ready" }}
      saveFunc={async () => p.close(undefined)}
      cancelFunc={() => p.close(undefined)}
      width="xl"
    >
      <div class="ui-spy text-sm">
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({ en: "Special indicators", fr: "Indicateurs spéciaux", pt: "Indicadores especiais" })}
          </div>
          <div class="text-xs">
            {t3({
              en: "The analysis modules read these ids by name as counts. A new instance is seeded with each as an empty base; an existing one adds or deletes them like any base. A special id can only be a base indicator.",
              fr: "Les modules d'analyse lisent ces identifiants par leur nom comme des dénombrements. Une nouvelle instance est initialisée avec chacun comme indicateur de base vide ; une instance existante les ajoute ou les supprime comme tout indicateur de base. Un identifiant spécial ne peut être qu'un indicateur de base.",
              pt: "Os módulos de análise leem estes IDs pelo nome como contagens. Uma nova instância é iniciada com cada um como indicador de base vazio; uma instância existente adiciona-os ou elimina-os como qualquer indicador de base. Um ID especial só pode ser um indicador de base.",
            })}
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-4 gap-y-1">
            <For each={SPECIAL_INDICATORS}>
              {(special) => (
                <div>
                  <span class="font-mono">{special.id}</span>
                  <span class="text-base-content-muted ml-2">{t3(special.label)}</span>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({ en: "Population terms", fr: "Termes de population", pt: "Termos de população" })}
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-x-4 gap-y-1">
            <For each={POPULATION_TYPE_IDS}>
              {(id) => (
                <div>
                  <span class="font-mono">{id}</span>
                  <span class="text-base-content-muted ml-2">{t3(populationTypeLabel(id))}</span>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({ en: "Reserved words", fr: "Mots réservés", pt: "Palavras reservadas" })}
          </div>
          <div class="text-xs">
            {t3({
              en: "No indicator id may be one of these, however it is produced: the special ids (except as a base), the population terms and the formula function names.",
              fr: "Aucun identifiant d'indicateur ne peut être l'un de ceux-ci, quelle que soit la façon dont il est produit : les identifiants spéciaux (sauf comme indicateur de base), les termes de population et les noms de fonctions des formules.",
              pt: "Nenhum ID de indicador pode ser um destes, seja como for produzido: os IDs especiais (exceto como base), os termos de população e os nomes das funções das fórmulas.",
            })}
          </div>
          <div class="font-mono text-xs">{RESERVED_WORDS.join(", ")}</div>
        </div>
      </div>
    </AlertFormHolder>
  );
}
