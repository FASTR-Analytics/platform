import {
  Button,
  Table,
  TableColumn,
  openComponent,
  createDeleteAction,
  type BulkAction,
} from "panther";
import { Show, createMemo } from "solid-js";
import {
  t3,
  TC,
  type CommonIndicatorWithMappings,
  type CalculatedIndicator,
} from "lib";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { EditCalculatedIndicatorForm } from "./calculated_indicator_editor";
import { SortCalculatedIndicatorsModal } from "./sort_calculated_indicators_modal";

type Props = {
  calculatedIndicators: CalculatedIndicator[];
  commonIndicators: CommonIndicatorWithMappings[];
};

export function CalculatedIndicatorsTable(p: Props) {
  async function handleCreate() {
    await openComponent({
      element: EditCalculatedIndicatorForm,
      props: {
        commonIndicators: p.commonIndicators,
        existingCalculatedIndicators: p.calculatedIndicators,
      },
    });
  }

  async function handleEdit(indicator: CalculatedIndicator) {
    await openComponent({
      element: EditCalculatedIndicatorForm,
      props: {
        commonIndicators: p.commonIndicators,
        existingCalculatedIndicators: p.calculatedIndicators,
        existing: indicator,
      },
    });
  }

  async function handleDuplicate(indicator: CalculatedIndicator) {
    await openComponent({
      element: EditCalculatedIndicatorForm,
      props: {
        commonIndicators: p.commonIndicators,
        existingCalculatedIndicators: p.calculatedIndicators,
        prefill: {
          ...indicator,
          calculated_indicator_id: `${indicator.calculated_indicator_id}_copy`,
          label: `${indicator.label} (copy)`,
        },
      },
    });
  }

  async function handleDelete(indicator: CalculatedIndicator) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Are you sure you want to delete this calculated indicator?",
          fr: "Êtes-vous sûr de vouloir supprimer cet indicateur calculé ?",
          pt: "Tem a certeza de que pretende eliminar este indicador calculado?",
        }),
        itemList: [indicator.calculated_indicator_id],
      },
      () =>
        serverActions.deleteCalculatedIndicators({
          calculatedIndicatorIds: [indicator.calculated_indicator_id],
        }),
    );
    await deleteAction.click();
  }

  async function handleSort() {
    await openComponent({
      element: SortCalculatedIndicatorsModal,
      props: {
        calculatedIndicators: p.calculatedIndicators,
      },
    });
  }

  async function handleBulkDelete(selected: CalculatedIndicator[]) {
    const ids = selected.map((si) => si.calculated_indicator_id);
    const labels = selected.map(
      (si) => `${si.calculated_indicator_id} ~ ${si.label}`,
    );
    const deleteAction = createDeleteAction(
      {
        text:
          ids.length === 1
            ? t3({
                en: "Are you sure you want to delete this calculated indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur calculé ?",
                pt: "Tem a certeza de que pretende eliminar este indicador calculado?",
              })
            : t3({
                en: "Are you sure you want to delete these calculated indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs calculés ?",
                pt: "Tem a certeza de que pretende eliminar estes indicadores calculados?",
              }),
        itemList: labels,
      },
      () =>
        serverActions.deleteCalculatedIndicators({
          calculatedIndicatorIds: ids,
        }),
    );
    await deleteAction.click();
  }

  function denomText(si: CalculatedIndicator): string {
    if (si.denom.kind === "none") {
      return "—";
    }
    if (si.denom.kind === "indicator") {
      return si.denom.indicator_id;
    }
    return `${si.denom.population_type} × ${si.denom.multiplier}`;
  }

  const columns: TableColumn<CalculatedIndicator>[] = [
    {
      key: "calculated_indicator_id",
      header: t3({ en: "ID", fr: "ID", pt: "ID" }),
      sortable: true,
      render: (si) => (
        <span class="font-mono">{si.calculated_indicator_id}</span>
      ),
    },
    {
      key: "label",
      header: t3(TC.label),
      sortable: true,
      render: (si) => si.label,
    },
    {
      key: "group_label",
      header: t3({ en: "Group", fr: "Groupe", pt: "Grupo" }),
      sortable: true,
    },
    {
      key: "num_indicator_id",
      header: t3({ en: "Numerator", fr: "Numérateur", pt: "Numerador" }),
      sortable: true,
      render: (si) => <span class="font-mono">{si.num_indicator_id}</span>,
    },
    {
      key: "denom",
      header: t3({ en: "Denominator", fr: "Dénominateur", pt: "Denominador" }),
      render: (si) => <span class="font-mono">{denomText(si)}</span>,
    },
    {
      key: "format_as",
      header: t3({ en: "Format", fr: "Format", pt: "Formato" }),
      sortable: true,
    },
    {
      key: "thresholds",
      header: t3({ en: "Thresholds", fr: "Seuils", pt: "Limiares" }),
      render: (si) => (
        <span class="font-mono text-xs">
          {si.threshold_direction === "higher_is_better" ? "↑" : "↓"}{" "}
          {si.threshold_green} / {si.threshold_yellow}
        </span>
      ),
    },
  ];

  const allColumns = createMemo<TableColumn<CalculatedIndicator>[]>(() => {
    if (!instanceState.currentUserIsGlobalAdmin) return columns;
    return [
      ...columns,
      {
        key: "actions",
        header: "",
        alignH: "right",
        render: (si) => (
          <div class="ui-gap-sm flex justify-end">
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleEdit(si);
              }}
              iconName="pencil"
              intent="base-100"
            />
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDuplicate(si);
              }}
              iconName="copy"
              intent="base-100"
            />
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleDelete(si);
              }}
              iconName="trash"
              intent="base-100"
            />
          </div>
        ),
      },
    ];
  });

  const bulkActions = createMemo<BulkAction<CalculatedIndicator>[]>(() =>
    instanceState.currentUserIsGlobalAdmin
      ? [
          {
            label: t3(TC.delete),
            intent: "danger",
            outline: true,
            onClick: handleBulkDelete,
          },
        ]
      : [],
  );

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Calculated indicators", fr: "Indicateurs calculés", pt: "Indicadores calculados" })}
        </div>
        <Show when={instanceState.currentUserIsGlobalAdmin}>
          <Button onClick={handleSort} iconName="gripVertical" outline>
            {t3({ en: "Sort indicators", fr: "Trier les indicateurs", pt: "Ordenar indicadores" })}
          </Button>
          <Button onClick={handleCreate} iconName="plus" intent="primary">
            {t3({
              en: "Create Calculated indicator",
              fr: "Créer un indicateur calculé",
              pt: "Criar indicador calculado",
            })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.calculatedIndicators}
          columns={allColumns()}
          keyField="calculated_indicator_id"
          noRowsMessage={t3({
            en: "No calculated indicators",
            fr: "Aucun indicateur calculé",
            pt: "Nenhum indicador calculado",
          })}
          bulkActions={bulkActions()}
          selectionLabel={t3({ en: "indicator", fr: "indicateur", pt: "indicador" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}
