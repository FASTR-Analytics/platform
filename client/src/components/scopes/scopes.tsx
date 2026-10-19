import {
  ALL_DATA_SCOPE_ID,
  type DatasetType,
  getModuleFamilyLabel,
  type Scope,
  type ScopeDefinition,
  type ScopeId,
  t3,
} from "lib";
import {
  Badge,
  Button,
  createTableConfig,
  type EditorComponentProps,
  FrameTop,
  HeadingBar,
  openComponent,
  plural,
  Table,
  type TableColumn,
  Tooltip,
} from "panther";
import { createMemo, Show } from "solid-js";
import {
  ProductCountBadge,
  scopeDisplayLabel,
  usageColumnHeader,
} from "~/components/_shared/mod.ts";
import { instanceState } from "~/state/instance/t1_store";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { AllDataScopeView, ScopeEditor } from "./scope_editor";

type ScopeRow = {
  id: ScopeId;
  label: string;
  hmis: string;
  hfa: string;
  iceh: string;
  productCount: number;
  migratedFrom: string[] | null;
};

type Props = EditorComponentProps<Record<never, never>, undefined>;

// Scopes are created, edited and deleted here, by global admins only (the
// scope routes are guarded the same way). A product picks one by label. The
// reserved "All data" scope is listed and opens read-only.
export function ScopesPage(p: Props) {
  holdCopilotView();
  copilotViewController.setView("scopes");

  const scopesTable = createTableConfig({
    sort: { key: "label", direction: "asc" },
  });

  const rows = createMemo(() => {
    const counts = productCountsByScope();
    return instanceState.scopes.map((scope) => toRow(scope, counts));
  });

  function openEditor(scope: Scope | undefined) {
    const productCount = scope === undefined
      ? 0
      : productCountsByScope().get(scope.id) ?? 0;
    if (scope?.id === ALL_DATA_SCOPE_ID) {
      void openComponent({
        element: AllDataScopeView,
        props: { scope, productCount },
      });
      return;
    }
    void openComponent({
      element: ScopeEditor,
      props: { scope, productCount },
    });
  }

  const columns: TableColumn<ScopeRow>[] = [
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      render: (row) => (
        <div class="ui-gap-sm flex flex-wrap items-center">
          <span>{row.label}</span>
          <Show when={row.migratedFrom}>
            {(projects) => <MigratedBadge projects={projects()} />}
          </Show>
        </div>
      ),
    },
    { key: "hmis", header: getModuleFamilyLabel("hmis") },
    { key: "hfa", header: getModuleFamilyLabel("hfa") },
    { key: "iceh", header: getModuleFamilyLabel("iceh") },
    {
      key: "productCount",
      header: usageColumnHeader(),
      sortable: true,
      searchable: false,
      render: (row) => <ProductCountBadge count={row.productCount} />,
    },
  ];

  return (
    <FrameTop
      pad="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3({ en: "Scopes", fr: "Portées", pt: "Âmbitos" })}
        />
      }
    >
      <Table
        data={rows()}
        columns={columns}
        config={scopesTable}
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

// A scope the update that retired projects made from their data windows
// (217_legacy_user_scopes); the hover names the projects.
function MigratedBadge(p: { projects: string[] }) {
  const list = () => p.projects.join(", ");
  return (
    <Tooltip
      content={t3({
        en:
          `Made automatically when this instance moved from projects to folders. It keeps the data limits of: ${list()}. Users who were only on these projects were given this scope, and those projects' reports and decks use it.`,
        fr:
          `Créée automatiquement lorsque cette instance est passée des projets aux dossiers. Elle conserve les limites de données de : ${list()}. Les utilisateurs qui n'étaient que dans ces projets ont reçu cette portée, et les rapports et présentations de ces projets l'utilisent.`,
        pt:
          `Criado automaticamente quando esta instância passou de projetos para pastas. Mantém os limites de dados de: ${list()}. Os utilizadores que estavam apenas nestes projetos receberam este âmbito, e os relatórios e apresentações desses projetos usam-no.`,
      })}
    >
      <Badge intent="neutral">
        {t3({ en: "Migrated", fr: "Migrée", pt: "Migrado" })}
      </Badge>
    </Tooltip>
  );
}

function countOf(
  list: string[] | null,
  one: string,
  other: string,
): string | undefined {
  return list === null
    ? undefined
    : `${list.length} ${plural(list.length, { one, other })}`;
}

// One family's section in a few words: excluded, unlimited, or its limits.
function describeSection(section: ScopeDefinition[DatasetType]): string {
  if (!section.include) {
    return t3({ en: "Excluded", fr: "Exclue", pt: "Excluída" });
  }
  const parts = [
    "adminArea2" in section ? section.adminArea2 ?? undefined : undefined,
    "years" in section && section.years !== null
      ? `${section.years.start}–${section.years.end}`
      : undefined,
    "timePoints" in section && section.timePoints !== null
      ? section.timePoints.join(", ")
      : undefined,
    countOf(
      section.modules,
      t3({ en: "module", fr: "module", pt: "módulo" }),
      t3({ en: "modules", fr: "modules", pt: "módulos" }),
    ),
    countOf(
      section.indicators,
      t3({ en: "indicator", fr: "indicateur", pt: "indicador" }),
      t3({ en: "indicators", fr: "indicateurs", pt: "indicadores" }),
    ),
    "categories" in section
      ? countOf(
        section.categories,
        t3({ en: "category", fr: "catégorie", pt: "categoria" }),
        t3({ en: "categories", fr: "catégories", pt: "categorias" }),
      )
      : undefined,
    "serviceCategories" in section
      ? countOf(
        section.serviceCategories,
        t3({
          en: "service category",
          fr: "catégorie de service",
          pt: "categoria de serviço",
        }),
        t3({
          en: "service categories",
          fr: "catégories de service",
          pt: "categorias de serviço",
        }),
      )
      : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0
    ? t3({ en: "No limits", fr: "Aucune limite", pt: "Sem limites" })
    : parts.join("; ");
}

function productCountsByScope(): Map<ScopeId, number> {
  const counts = new Map<ScopeId, number>();
  for (const product of instanceState.products) {
    counts.set(product.scopeId, (counts.get(product.scopeId) ?? 0) + 1);
  }
  return counts;
}

function toRow(scope: Scope, counts: Map<ScopeId, number>): ScopeRow {
  return {
    id: scope.id,
    label: scopeDisplayLabel(scope),
    hmis: describeSection(scope.definition.hmis),
    hfa: describeSection(scope.definition.hfa),
    iceh: describeSection(scope.definition.iceh),
    productCount: counts.get(scope.id) ?? 0,
    migratedFrom: scope.migratedFrom,
  };
}
