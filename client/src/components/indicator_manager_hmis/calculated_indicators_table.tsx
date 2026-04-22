import {
  Button,
  Table,
  TableColumn,
  openComponent,
  timActionDelete,
  type BulkAction,
} from "panther";
import { Show } from "solid-js";
import {
  t3,
  TC,
  type CommonIndicatorWithMappings,
  type CalculatedIndicator,
} from "lib";
import { serverActions } from "~/server_actions";
import { EditCalculatedIndicatorForm } from "./calculated_indicator_editor";

type Props = {
  calculatedIndicators: CalculatedIndicator[];
  commonIndicators: CommonIndicatorWithMappings[];
  isGlobalAdmin: boolean;
};

export function CalculatedIndicatorsTable(p: Props) {
  const commonIndicatorIds = () =>
    new Set(p.commonIndicators.map((ci) => ci.indicator_common_id));

  function hasBrokenReference(si: CalculatedIndicator): boolean {
    const ids = commonIndicatorIds();
    if (!ids.has(si.num_indicator_id)) return true;
    if (si.denom.kind === "indicator" && !ids.has(si.denom.indicator_id)) {
      return true;
    }
    return false;
  }

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
        existing: {
          ...indicator,
          calculated_indicator_id: `${indicator.calculated_indicator_id}_copy`,
          label: `${indicator.label} (copy)`,
        },
      },
    });
  }

  async function handleDelete(indicator: CalculatedIndicator) {
    const deleteAction = timActionDelete(
      {
        text: t3({
          en: "Are you sure you want to delete this calculated indicator?",
          fr: "Êtes-vous sûr de vouloir supprimer cet indicateur calculé ?",
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

  async function handleBulkDelete(selected: CalculatedIndicator[]) {
    const ids = selected.map((si) => si.calculated_indicator_id);
    const labels = selected.map(
      (si) => `${si.calculated_indicator_id} ~ ${si.label}`,
    );
    const deleteAction = timActionDelete(
      {
        text:
          ids.length === 1
            ? t3({
                en: "Are you sure you want to delete this calculated indicator?",
                fr: "Êtes-vous sûr de vouloir supprimer cet indicateur calculé ?",
              })
            : t3({
                en: "Are you sure you want to delete these calculated indicators?",
                fr: "Êtes-vous sûr de vouloir supprimer ces indicateurs calculés ?",
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
    if (si.denom.kind === "indicator") {
      return si.denom.indicator_id;
    }
    return `pop × ${si.denom.population_fraction}`;
  }

  const columns: TableColumn<CalculatedIndicator>[] = [
    {
      key: "calculated_indicator_id",
      header: t3({ en: "ID", fr: "ID" }),
      sortable: true,
      render: (si) => (
        <span class="font-mono">{si.calculated_indicator_id}</span>
      ),
    },
    {
      key: "label",
      header: t3(TC.label),
      sortable: true,
      render: (si) => (
        <div class="flex items-center gap-2">
          <span>{si.label}</span>
          <Show when={hasBrokenReference(si)}>
            <span class="bg-danger text-danger-content font-500 rounded px-2 py-0.5 text-xs">
              {t3({ en: "Broken reference", fr: "Référence cassée" })}
            </span>
          </Show>
        </div>
      ),
    },
    {
      key: "group_label",
      header: t3({ en: "Group", fr: "Groupe" }),
      sortable: true,
    },
    {
      key: "num_indicator_id",
      header: t3({ en: "Numerator", fr: "Numérateur" }),
      sortable: true,
      render: (si) => <span class="font-mono">{si.num_indicator_id}</span>,
    },
    {
      key: "denom",
      header: t3({ en: "Denominator", fr: "Dénominateur" }),
      render: (si) => <span class="font-mono">{denomText(si)}</span>,
    },
    {
      key: "format_as",
      header: t3({ en: "Format", fr: "Format" }),
      sortable: true,
    },
    {
      key: "thresholds",
      header: t3({ en: "Thresholds", fr: "Seuils" }),
      render: (si) => (
        <span class="font-mono text-xs">
          {si.threshold_direction === "higher_is_better" ? "↑" : "↓"}{" "}
          {si.threshold_green} / {si.threshold_yellow}
        </span>
      ),
    },
  ];

  if (p.isGlobalAdmin) {
    columns.push({
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
    });
  }

  const bulkActions: BulkAction<CalculatedIndicator>[] = p.isGlobalAdmin
    ? [
        {
          label: t3(TC.delete),
          intent: "danger",
          outline: true,
          onClick: handleBulkDelete,
        },
      ]
    : [];

  return (
    <div class="flex h-full flex-col">
      <div class="ui-gap-sm flex items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Calculated indicators", fr: "Indicateurs calculés" })}
        </div>
        <Show when={p.isGlobalAdmin}>
          <Button onClick={handleCreate} iconName="plus" intent="primary">
            {t3({
              en: "Create Calculated indicator",
              fr: "Créer un indicateur calculé",
            })}
          </Button>
        </Show>
      </div>
      <div class="h-0 w-full flex-1">
        <Table
          data={p.calculatedIndicators}
          columns={columns}
          keyField="calculated_indicator_id"
          noRowsMessage={t3({
            en: "No calculated indicators",
            fr: "Aucun indicateur calculé",
          })}
          bulkActions={bulkActions}
          selectionLabel={t3({ en: "indicator", fr: "indicateur" })}
          fitTableToAvailableHeight
        />
      </div>
    </div>
  );
}
