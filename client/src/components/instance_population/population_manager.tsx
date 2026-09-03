// The instance Population page (PLAN_1b): the store's per-(type, level)
// coverage against the HMIS structure, the stored rows, CSV import/export,
// and the population type vocabulary.

import { t3, TC, type PopulationCoverage, type PopulationRow } from "lib";
import {
  Button,
  Csv,
  FrameRight,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  Table,
  TableFromCsv,
  type StateHolder,
  type TableColumn,
  createDeleteAction,
  getEditorWrapper,
  toNum0,
} from "panther";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";
import { getPopulationRowsFromCacheOrFetch } from "~/state/instance/t2_population";
import { PopulationImportForm } from "./_import_form";
import { PopulationTypesEditor } from "./_population_types";

type Props = {
  backToInstance: () => void;
};

export function PopulationManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const canConfigure = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

  const hasRows = () => instanceState.populationCoverage.length > 0;

  async function openImport() {
    await openEditor({ element: PopulationImportForm, props: {} });
  }

  async function openTypes() {
    await openEditor({ element: PopulationTypesEditor, props: {} });
  }

  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Delete all population figures?",
        fr: "Supprimer tous les chiffres de population ?",
        pt: "Eliminar todos os valores de população?",
      }),
      () => serverActions.deleteAllPopulation({}),
    );
    await deleteAction.click();
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={p.backToInstance}
            heading={t3({
              en: "Population",
              fr: "Population",
              pt: "População",
            })}
          >
            <Show when={hasRows()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/population/export/csv?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={canConfigure()}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <div class="font-700 text-lg">
                  {t3({ en: "Figures", fr: "Chiffres", pt: "Valores" })}
                </div>
                <Button onClick={openImport} iconName="upload" fullWidth>
                  {t3({
                    en: "Import CSV",
                    fr: "Importer un CSV",
                    pt: "Importar CSV",
                  })}
                </Button>
                <Show when={hasRows()}>
                  <Button
                    onClick={attemptDeleteAll}
                    intent="danger"
                    outline
                    iconName="trash"
                    fullWidth
                  >
                    {t3({
                      en: "Delete all figures",
                      fr: "Supprimer tous les chiffres",
                      pt: "Eliminar todos os valores",
                    })}
                  </Button>
                </Show>
                <div class="font-700 pt-4 text-lg">
                  {t3({
                    en: "Population types",
                    fr: "Types de population",
                    pt: "Tipos de população",
                  })}
                </div>
                <Button onClick={openTypes} iconName="pencil" fullWidth>
                  {t3({
                    en: "Edit types",
                    fr: "Modifier les types",
                    pt: "Editar tipos",
                  })}
                </Button>
              </div>
            </Show>
          }
        >
          <div class="ui-pad ui-spy h-full w-full overflow-auto">
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "Annual population figures per admin area, used by indicator formulas that divide by a population. A results package can only be generated when every area at the HMIS structure's finest level has figures covering the data's years (one year of extrapolation is allowed at each end).",
                fr: "Chiffres de population annuels par unité administrative, utilisés par les formules d'indicateurs qui divisent par une population. Un paquet de résultats ne peut être généré que si chaque unité au niveau le plus fin de la structure SNIS dispose de chiffres couvrant les années des données (une année d'extrapolation est admise à chaque extrémité).",
                pt: "Valores anuais de população por zona administrativa, usados pelas fórmulas de indicadores que dividem por uma população. Um pacote de resultados só pode ser gerado quando todas as zonas do nível mais fino da estrutura SNIS têm valores que cobrem os anos dos dados (é admitido um ano de extrapolação em cada extremo).",
              })}
            </div>
            <CoverageTable canConfigure={canConfigure()} />
            <RowsTable />
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}

function CoverageTable(p: { canConfigure: boolean }) {
  type CoverageItem = PopulationCoverage & { key: string };
  const items = createMemo<CoverageItem[]>(() =>
    instanceState.populationCoverage.map((c) => ({
      ...c,
      key: `${c.populationType}|${c.adminAreaLevel}`,
    }))
  );
  const typeLabel = (id: string) =>
    instanceState.populationTypes.find((t) => t.id === id)?.label ?? id;

  const columns: TableColumn<CoverageItem>[] = [
    {
      key: "populationType",
      header: t3({
        en: "Population type",
        fr: "Type de population",
        pt: "Tipo de população",
      }),
      sortable: true,
      render: (item) => (
        <span>
          {typeLabel(item.populationType)}{" "}
          <span class="text-base-content-muted font-mono text-xs">
            {item.populationType}
          </span>
        </span>
      ),
    },
    {
      key: "adminAreaLevel",
      header: t3({
        en: "Admin area level",
        fr: "Niveau administratif",
        pt: "Nível de zona administrativa",
      }),
      sortable: true,
      render: (item) => (
        <span>
          {t3(getAdminAreaLabel(item.adminAreaLevel as 2 | 3 | 4))}
        </span>
      ),
    },
    {
      key: "years",
      header: t3({ en: "Years", fr: "Années", pt: "Anos" }),
      sortable: true,
      sortValue: (item) => item.firstYear,
      render: (item) => (
        <span class="font-mono">
          {item.firstYear === item.lastYear
            ? item.firstYear
            : `${item.firstYear}–${item.lastYear}`}{" "}
          <span class="text-base-content-muted">({item.yearCount})</span>
        </span>
      ),
    },
    {
      key: "areas",
      header: t3({ en: "Areas", fr: "Unités", pt: "Zonas" }),
      sortable: true,
      sortValue: (item) => item.areaCount,
      render: (item) => (
        <span class="font-mono">
          {toNum0(item.areaCount)} / {toNum0(item.structureAreaCount)}
        </span>
      ),
    },
    {
      key: "complete",
      header: t3({ en: "Coverage", fr: "Couverture", pt: "Cobertura" }),
      sortable: true,
      sortValue: (item) => (item.complete ? 1 : 0),
      render: (item) => (
        <Show
          when={item.complete}
          fallback={
            <span class="text-danger">
              {t3({ en: "Incomplete", fr: "Incomplète", pt: "Incompleta" })}
            </span>
          }
        >
          <span class="text-success">
            {t3({ en: "Complete", fr: "Complète", pt: "Completa" })}
          </span>
        </Show>
      ),
    },
    {
      key: "actions",
      header: "",
      alignH: "right",
      render: (item) => {
        const deleteAction = createDeleteAction(
          {
            text: t3({
              en: "Delete these population figures?",
              fr: "Supprimer ces chiffres de population ?",
              pt: "Eliminar estes valores de população?",
            }),
            itemList: [
              `${typeLabel(item.populationType)} — ${
                t3(getAdminAreaLabel(item.adminAreaLevel as 2 | 3 | 4))
              }`,
            ],
          },
          () =>
            serverActions.deletePopulationGroup({
              populationType: item.populationType,
              adminAreaLevel: item.adminAreaLevel,
            }),
        );
        return (
          <Show when={p.canConfigure}>
            <Button
              iconName="trash"
              intent="danger"
              size="sm"
              onClick={deleteAction.click}
            />
          </Show>
        );
      },
    },
  ];

  return (
    <Show
      when={items().length > 0}
      fallback={
        <div class="text-base-content-muted py-4">
          {t3({
            en: "No population figures yet. Import a CSV to add them.",
            fr: "Aucun chiffre de population pour le moment. Importez un CSV pour en ajouter.",
            pt: "Ainda não há valores de população. Importe um CSV para os adicionar.",
          })}
        </div>
      }
    >
      <Table
        data={items()}
        columns={columns}
        keyField="key"
        noRowsMessage=""
      />
    </Show>
  );
}

function RowsTable() {
  const [state, setState] = createSignal<StateHolder<PopulationRow[]>>({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  createEffect(() => {
    const stamp = instanceState.populationLastUpdated;
    if (stamp === undefined) {
      setState({ status: "ready", data: [] });
      return;
    }
    getPopulationRowsFromCacheOrFetch(stamp).then((res) => {
      if (instanceState.populationLastUpdated !== stamp) return;
      setState(
        res.success
          ? { status: "ready", data: res.data }
          : { status: "error", err: res.err },
      );
    });
  });

  return (
    <StateHolderWrapper state={state()}>
      {(rows) => (
        <Show when={rows.length > 0}>
          {(_) => {
            const csv = createMemo(() => {
              const maxLevel = rows.reduce(
                (m, r) => Math.max(m, r.adminAreaLevel),
                2,
              );
              const areaHeaders = [
                "admin_area_1",
                "admin_area_2",
                "admin_area_3",
                "admin_area_4",
              ].slice(0, maxLevel);
              const colHeaders = [
                ...areaHeaders,
                "year",
                "population_type",
                "count",
              ];
              const aoa = rows.map((r) => [
                ...[r.adminArea1, r.adminArea2, r.adminArea3, r.adminArea4]
                  .slice(0, maxLevel),
                String(r.year),
                r.populationType,
                String(r.count),
              ]);
              return new Csv({ aoa, colHeaders });
            });
            return (
              <div class="h-[60vh]">
                <TableFromCsv
                  csv={csv()}
                  knownTotalCount={rows.length}
                  cellFormatter={(str) => (str === "" ? "." : str)}
                  alignText="left"
                />
              </div>
            );
          }}
        </Show>
      )}
    </StateHolderWrapper>
  );
}
