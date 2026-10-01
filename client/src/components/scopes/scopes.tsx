import { type Scope, type ScopeDefinition, t3 } from "lib";
import {
  Button,
  FrameTop,
  openComponent,
  Table,
  type TableColumn,
} from "panther";
import { instanceState } from "~/state/instance/t1_store";
import { ScopeEditor } from "./scope_editor";

type ScopeRow = {
  id: string;
  label: string;
  geography: string;
  time: string;
  data: string;
  productCount: number;
};

const noLimit = () =>
  t3({ en: "No limit", fr: "Aucune limite", pt: "Sem limite" });

function describeTime(time: ScopeDefinition["time"]): string {
  const parts = [
    time.years === null ? undefined : `${time.years.start}–${time.years.end}`,
    time.hfaTimePoints === null ? undefined : time.hfaTimePoints.join(", "),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? noLimit() : parts.join("; ");
}

function describeData(definition: ScopeDefinition): string {
  const count = (list: string[] | null, one: string, other: string) =>
    list === null
      ? undefined
      : `${list.length} ${list.length === 1 ? one : other}`;
  const parts = [
    count(
      definition.modules,
      t3({ en: "module", fr: "module", pt: "módulo" }),
      t3({ en: "modules", fr: "modules", pt: "módulos" }),
    ),
    count(
      definition.indicators.hmis,
      t3({ en: "HMIS indicator", fr: "indicateur HMIS", pt: "indicador HMIS" }),
      t3({
        en: "HMIS indicators",
        fr: "indicateurs HMIS",
        pt: "indicadores HMIS",
      }),
    ),
    count(
      definition.indicators.hfa,
      t3({ en: "HFA indicator", fr: "indicateur HFA", pt: "indicador HFA" }),
      t3({
        en: "HFA indicators",
        fr: "indicateurs HFA",
        pt: "indicadores HFA",
      }),
    ),
    count(
      definition.indicators.iceh,
      t3({ en: "ICEH indicator", fr: "indicateur ICEH", pt: "indicador ICEH" }),
      t3({
        en: "ICEH indicators",
        fr: "indicateurs ICEH",
        pt: "indicadores ICEH",
      }),
    ),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? noLimit() : parts.join("; ");
}

function productCountFor(scopeId: string): number {
  return instanceState.products.filter((p) => p.scopeId === scopeId).length;
}

function toRow(scope: Scope): ScopeRow {
  return {
    id: scope.id,
    label: scope.label,
    geography: scope.definition.geography?.adminArea2 ?? noLimit(),
    time: describeTime(scope.definition.time),
    data: describeData(scope.definition),
    productCount: productCountFor(scope.id),
  };
}

// Scopes are created, edited and deleted here, by global admins only (the
// scope routes are guarded the same way). A product picks one by label.
export function InstanceScopes() {
  function openEditor(scope: Scope | undefined) {
    void openComponent({
      element: ScopeEditor,
      props: {
        scope,
        productCount: scope === undefined ? 0 : productCountFor(scope.id),
      },
    });
  }

  const columns: TableColumn<ScopeRow>[] = [
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "geography",
      header: t3({ en: "Geography", fr: "Géographie", pt: "Geografia" }),
      sortable: true,
    },
    {
      key: "time",
      header: t3({ en: "Time", fr: "Période", pt: "Período" }),
    },
    {
      key: "data",
      header: t3({ en: "Data", fr: "Données", pt: "Dados" }),
    },
    {
      key: "productCount",
      header: t3({ en: "Products", fr: "Produits", pt: "Produtos" }),
      sortable: true,
      searchable: false,
    },
  ];

  return (
    <FrameTop pad="md">
      <Table
        data={instanceState.scopes.map(toRow)}
        columns={columns}
        defaultSort={{ key: "label", direction: "asc" }}
        keyField="id"
        noRowsMessage={t3({
          en: "No scopes",
          fr: "Aucune portée",
          pt: "Sem âmbitos",
        })}
        onRowClick={(row) =>
          openEditor(instanceState.scopes.find((s) => s.id === row.id))}
        itemLabel={{
          one: t3({ en: "scope", fr: "portée", pt: "âmbito" }),
          other: t3({ en: "scopes", fr: "portées", pt: "âmbitos" }),
        }}
        toolbar={{
          search: true,
          children: (
            <Button onClick={() => openEditor(undefined)} iconName="plus">
              {t3({
                en: "New scope",
                fr: "Nouvelle portée",
                pt: "Novo âmbito",
              })}
            </Button>
          ),
        }}
      />
    </FrameTop>
  );
}
