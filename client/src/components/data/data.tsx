import {
  type AdminAreaLevel,
  ALL_ADMIN_AREA_LEVELS,
  type FacilityFamily,
  t3,
} from "lib";
import {
  Button,
  type EditorComponentProps,
  FrameTop,
  HeadingBar,
  openComponent,
  Table,
  type TableColumn,
  toNum0,
} from "panther";
import { type JSX, Show } from "solid-js";
import { InstanceDatasetIceh } from "./iceh/mod.ts";
import { Facilities } from "./facilities/mod.ts";
import { FamilyConfiguration } from "./family_configuration";
import {
  HfaIndicatorsManager,
  HfaWeights,
  InstanceDatasetHfa,
  InstanceHfaTimePoints,
} from "./hfa/mod.ts";
import { GeoJsonManager } from "./geojson/mod.ts";
import {
  Dhis2ManageConnection,
  IndicatorsManager,
  InstanceDatasetHmis,
  PopulationManager,
} from "./hmis/mod.ts";
import {
  instanceState,
  maxDepth,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { openShellEditor } from "~/state/t4_ui";
import { AdminAreaLabels, AiContextForm } from "./general/mod.ts";

type Props = {};

// "unset" is an optional item left empty: shown, but not flagged as missing.
type RowStatus = "ready" | "partial" | "missing" | "unset";

type DataRow = {
  label: string;
  summary: string;
  status: RowStatus;
  onClick: () => void;
};

export function InstanceData(p: Props) {
  const canConfigureData = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

  // Structure config and the instance settings keep the gate of the Settings
  // tab they came from, so who can change them is unchanged.
  const canConfigureSettings = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_settings;

  const enabledColumnCount = (family: FacilityFamily) => {
    const schema = structureSchemaForFamily(family);
    return [
      schema.includeNames,
      schema.includeTypes,
      schema.includeOwnership,
      schema.includeCustom1,
      schema.includeCustom2,
      schema.includeCustom3,
      schema.includeCustom4,
      schema.includeCustom5,
    ].filter(Boolean).length;
  };

  const isAdminAreaLabelSet = (level: AdminAreaLevel) =>
    !!instanceState.adminAreaLabels[`label${level}`];

  const geojsonLevels = (family: FacilityFamily) =>
    instanceState.geojsonMaps
      .filter((g) => g.family === family)
      .map((g) => g.adminAreaLevel);

  // Every row opens a full-page view over the shell; its Back closes it. The
  // const type parameter keeps a family literal from widening to string.
  function openSubPage<const TProps>(
    element: (p: EditorComponentProps<TProps, undefined>) => JSX.Element,
    props: TProps,
  ) {
    void openShellEditor({ element, props });
  }

  const hasData = (dataset: "hmis" | "hfa" | "iceh"): DataRow["status"] =>
    instanceState.datasetsWithData.includes(dataset) ? "ready" : "missing";

  const dataSummary = (dataset: "hmis" | "hfa" | "iceh") =>
    instanceState.datasetsWithData.includes(dataset)
      ? t3({ en: "Has data", fr: "Contient des données", pt: "Contém dados" })
      : t3({
        en: "No data added",
        fr: "Aucune donnée ajoutée",
        pt: "Nenhum dado adicionado",
      });

  const configurationRow = (family: FacilityFamily): DataRow => ({
    label: t3({ en: "Configuration", fr: "Configuration", pt: "Configuração" }),
    summary: t3({
      en: `${structureSchemaForFamily(family).adminDepth} admin area levels, ${
        toNum0(enabledColumnCount(family))
      } facility columns`,
      fr: `${
        structureSchemaForFamily(family).adminDepth
      } niveaux d'unités administratives, ${
        toNum0(enabledColumnCount(family))
      } colonnes des établissements`,
      pt: `${
        structureSchemaForFamily(family).adminDepth
      } níveis de zonas administrativas, ${
        toNum0(enabledColumnCount(family))
      } colunas dos estabelecimentos`,
    }),
    status: "ready",
    onClick: () => openSubPage(FamilyConfiguration, { family }),
  });

  // Admin areas are derived from the facility rows, so their counts are
  // reported here rather than as a row of their own.
  const facilitiesRow = (family: FacilityFamily): DataRow => {
    const count = instanceState.structure?.[family].facilities ?? 0;
    const areas = ALL_ADMIN_AREA_LEVELS.filter(
      (level) => structureSchemaForFamily(family).adminDepth >= level,
    ).map(
      (level) =>
        `${t3(getAdminAreaLabel(level))} ${
          toNum0(instanceState.structure?.[family][`adminArea${level}s`] ?? 0)
        }`,
    );
    return {
      label: t3({
        en: "Facilities",
        fr: "Établissements",
        pt: "Estabelecimentos de saúde",
      }),
      summary: count > 0
        ? [
          t3({
            en: `${toNum0(count)} facilities`,
            fr: `${toNum0(count)} établissements`,
            pt: `${toNum0(count)} estabelecimentos de saúde`,
          }),
          ...areas,
        ].join(" · ")
        : t3({
          en: "No facilities imported",
          fr: "Aucun établissement importé",
          pt: "Nenhum estabelecimento de saúde importado",
        }),
      status: count > 0 ? "ready" : "missing",
      onClick: () => openSubPage(Facilities, { family }),
    };
  };

  const geojsonRow = (family: FacilityFamily): DataRow => ({
    label: t3({
      en: "GeoJSON maps",
      fr: "Cartes GeoJSON",
      pt: "Mapas GeoJSON",
    }),
    summary: geojsonLevels(family).length > 0
      ? `${
        t3({
          en: "Levels configured",
          fr: "Niveaux configurés",
          pt: "Níveis configurados",
        })
      }: ${geojsonLevels(family).join(", ")}`
      : t3({
        en: "No GeoJSON maps uploaded",
        fr: "Aucune carte GeoJSON téléchargée",
        pt: "Nenhum mapa GeoJSON carregado",
      }),
    status: geojsonLevels(family).length > 0 ? "ready" : "missing",
    onClick: () => openSubPage(GeoJsonManager, { family }),
  });

  const generalRows = (): DataRow[] => {
    const labelsSet = ALL_ADMIN_AREA_LEVELS.some(isAdminAreaLabelSet);
    const aiContext = instanceState.aiContext.trim();
    return [
      {
        label: t3({
          en: "Admin area labels",
          fr: "Libellés des unités administratives",
          pt: "Rótulos das zonas administrativas",
        }),
        summary: labelsSet
          ? ALL_ADMIN_AREA_LEVELS.filter((level) => maxDepth() >= level)
            .map((level) => t3(getAdminAreaLabel(level)))
            .join(", ")
          : t3({
            en: "Not set — using default names",
            fr: "Non définis — noms par défaut utilisés",
            pt: "Não definidos — a usar nomes predefinidos",
          }),
        status: labelsSet ? "ready" : "missing",
        onClick: () => openSubPage(AdminAreaLabels, {}),
      },
      {
        label: t3({
          en: "AI context",
          fr: "Contexte IA",
          pt: "Contexto de IA",
        }),
        summary: aiContext ||
          t3({ en: "Not set", fr: "Non défini", pt: "Não definido" }),
        status: aiContext ? "ready" : "unset",
        onClick: () =>
          void openComponent({ element: AiContextForm, props: {} }),
      },
    ];
  };

  const hmisRows = (): DataRow[] => {
    const rows: DataRow[] = [];
    if (canConfigureSettings()) {
      rows.push(configurationRow("hmis"));
    }
    if (canConfigureData()) {
      const url = instanceState.dhis2ConnectionUrl;
      rows.push({
        label: t3({
          en: "DHIS2 connection",
          fr: "Connexion DHIS2",
          pt: "Ligação DHIS2",
        }),
        summary: url ||
          t3({
            en: "No connection configured",
            fr: "Aucune connexion configurée",
            pt: "Nenhuma ligação configurada",
          }),
        status: url ? "ready" : "missing",
        onClick: () =>
          void openComponent({ element: Dhis2ManageConnection, props: {} }),
      });
    }
    const indicators = instanceState.indicators.hmisIndicators;
    const populationLevel = instanceState.populationRowCount > 0
      ? instanceState.populationLevel
      : undefined;
    rows.push(
      facilitiesRow("hmis"),
      {
        label: t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" }),
        summary: indicators > 0
          ? t3({
            en: `${toNum0(indicators)} indicators`,
            fr: `${toNum0(indicators)} indicateurs`,
            pt: `${toNum0(indicators)} indicadores`,
          })
          : t3({
            en: "No indicators",
            fr: "Aucun indicateur",
            pt: "Nenhum indicador",
          }),
        status: indicators > 0 ? "ready" : "missing",
        onClick: () => openSubPage(IndicatorsManager, {}),
      },
      {
        label: t3({ en: "Data", fr: "Données", pt: "Dados" }),
        summary: dataSummary("hmis"),
        status: hasData("hmis"),
        onClick: () => openSubPage(InstanceDatasetHmis, {}),
      },
      geojsonRow("hmis"),
      {
        label: t3({ en: "Population", fr: "Population", pt: "População" }),
        summary: populationLevel !== undefined
          ? t3({
            en: `${t3(getAdminAreaLabel(populationLevel))} level, ${
              toNum0(instanceState.populationCoverage.length)
            } population types with data`,
            fr: `Niveau ${t3(getAdminAreaLabel(populationLevel))}, ${
              toNum0(instanceState.populationCoverage.length)
            } types de population renseignés`,
            pt: `Nível ${t3(getAdminAreaLabel(populationLevel))}, ${
              toNum0(instanceState.populationCoverage.length)
            } tipos de população com dados`,
          })
          : instanceState.populationLevel === undefined
          ? t3({
            en: "No population level set",
            fr: "Aucun niveau de population défini",
            pt: "Nenhum nível de população definido",
          })
          : t3({
            en: "No population data",
            fr: "Aucune donnée de população",
            pt: "Sem dados de população",
          }),
        status: populationLevel !== undefined ? "ready" : "unset",
        onClick: () => openSubPage(PopulationManager, {}),
      },
    );
    return rows;
  };

  const hfaRows = (): DataRow[] => {
    const rows: DataRow[] = [];
    if (canConfigureSettings()) {
      rows.push(configurationRow("hfa"));
    }
    const timePoints = instanceState.hfaTimePoints.length;
    const weights = instanceState.hfaWeights;
    const hasWeights = weights.some((tp) => tp.weightCount > 0);
    const weightsPartial = weights.some(
      (tp) =>
        tp.weightCount > 0 &&
        tp.facilitiesWithDataAndWeight < tp.facilitiesWithData,
    );
    const indicators = instanceState.indicators.hfaIndicators;
    rows.push(
      facilitiesRow("hfa"),
      {
        label: t3({
          en: "Time points",
          fr: "Points temporels",
          pt: "Pontos temporais",
        }),
        summary: timePoints > 0
          ? t3({
            en: `${toNum0(timePoints)} time points`,
            fr: `${toNum0(timePoints)} points temporels`,
            pt: `${toNum0(timePoints)} pontos temporais`,
          })
          : t3({
            en: "No time points (import data to create)",
            fr: "Aucun point temporel (importer des données pour créer)",
            pt: "Nenhum ponto temporal (importar dados para criar)",
          }),
        status: timePoints > 0 ? "ready" : "missing",
        onClick: () => openSubPage(InstanceHfaTimePoints, {}),
      },
      {
        label: t3({
          en: "Sampling weights",
          fr: "Pondérations d'échantillonnage",
          pt: "Pesos de amostragem",
        }),
        summary: hasWeights
          ? weights
            .map(
              (tp) =>
                `${tp.timePoint}: ${toNum0(tp.facilitiesWithDataAndWeight)}/${
                  toNum0(tp.facilitiesWithData)
                }`,
            )
            .join(" · ")
          : t3({
            en: "No weights imported",
            fr: "Aucune pondération importée",
            pt: "Nenhum peso importado",
          }),
        status: !hasWeights ? "missing" : weightsPartial ? "partial" : "ready",
        onClick: () => openSubPage(HfaWeights, {}),
      },
      {
        label: t3({ en: "Indicators", fr: "Indicateurs", pt: "Indicadores" }),
        summary: indicators > 0
          ? t3({
            en: `${toNum0(indicators)} indicators`,
            fr: `${toNum0(indicators)} indicateurs`,
            pt: `${toNum0(indicators)} indicadores`,
          })
          : t3({
            en: "No HFA indicators configured",
            fr: "Aucun indicateur HFA configuré",
            pt: "Nenhum indicador HFA configurado",
          }),
        status: indicators > 0 ? "ready" : "missing",
        onClick: () => openSubPage(HfaIndicatorsManager, {}),
      },
      {
        label: t3({ en: "Data", fr: "Données", pt: "Dados" }),
        summary: dataSummary("hfa"),
        status: hasData("hfa"),
        onClick: () => openSubPage(InstanceDatasetHfa, {}),
      },
      geojsonRow("hfa"),
    );
    return rows;
  };

  const icehRows = (): DataRow[] => [
    {
      label: t3({
        en: "Equity data",
        fr: "Données d'équité",
        pt: "Dados de equidade",
      }),
      summary: dataSummary("iceh"),
      status: hasData("iceh"),
      onClick: () => openSubPage(InstanceDatasetIceh, {}),
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          compact
          heading={t3({ en: "Data", fr: "Données", pt: "Dados" })}
        />
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <div class="ui-spy-lg max-w-3xl">
          <DataSection
            data-tour="instance-data-hmis"
            heading={t3({ en: "HMIS", fr: "SNIS", pt: "HMIS" })}
            subheading={t3({
              en: "Health Management Information System",
              fr: "Système d'information sanitaire",
              pt: "Sistema de informação de saúde",
            })}
            rows={hmisRows()}
          />
          <DataSection
            data-tour="instance-data-hfa"
            heading={t3({ en: "HFA", fr: "Enquêtes FOSA", pt: "HFA" })}
            subheading={t3({
              en: "Health facility assessments",
              fr: "Enquêtes auprès des établissements",
              pt: "Avaliações de unidades de saúde",
            })}
            rows={hfaRows()}
          />
          <DataSection
            data-tour="instance-data-iceh"
            heading={t3({ en: "ICEH", fr: "ICEH", pt: "ICEH" })}
            subheading={t3({
              en: "Equity data",
              fr: "Données d'équité",
              pt: "Dados de equidade",
            })}
            rows={icehRows()}
          />
          <Show when={canConfigureSettings()}>
            <DataSection
              heading={t3({
                en: "Instance settings",
                fr: "Paramètres de l'instance",
                pt: "Definições da instância",
              })}
              subheading={t3({
                en: "Shared by every dataset",
                fr: "Communs à tous les jeux de données",
                pt: "Comuns a todos os conjuntos de dados",
              })}
              rows={generalRows()}
              hideReadyCount
            />
          </Show>
        </div>
      </div>
    </FrameTop>
  );
}

function DataSection(p: {
  heading: string;
  subheading: string;
  rows: DataRow[];
  hideReadyCount?: boolean;
  "data-tour"?: string;
}) {
  const readyCount = () => p.rows.filter((r) => r.status === "ready").length;
  return (
    <section class="ui-spy-sm" data-tour={p["data-tour"]}>
      <div class="ui-gap-sm flex items-baseline">
        <h2 class="ui-text-heading">{p.heading}</h2>
        <span class="text-base-content-muted flex-1 truncate text-sm">
          {p.subheading}
        </span>
        <Show when={!p.hideReadyCount}>
          <span class="text-base-content-muted text-sm text-nowrap">
            {t3({
              en: `${readyCount()} of ${p.rows.length} ready`,
              fr: `${readyCount()} sur ${p.rows.length} prêts`,
              pt: `${readyCount()} de ${p.rows.length} prontos`,
            })}
          </span>
        </Show>
      </div>
      <Table
        data={p.rows}
        columns={DATA_ROW_COLUMNS()}
        keyField="label"
        hideHeader
      />
    </section>
  );
}

// Fixed widths on the outer columns line the sections' separate tables up.
const DATA_ROW_COLUMNS = (): TableColumn<DataRow>[] => [
  {
    key: "label",
    header: "",
    width: "12rem",
    render: (row) => row.label,
  },
  {
    key: "summary",
    header: "",
    render: (row) => (
      <div class="text-base-content-muted line-clamp-2">{row.summary}</div>
    ),
  },
  {
    key: "status",
    header: "",
    width: "8rem",
    render: (row) => <StatusMark status={row.status} />,
  },
  {
    key: "view",
    header: "",
    alignH: "right",
    width: "1%",
    render: (row) => (
      <Button
        size="sm"
        intent="base-100"
        iconName="chevronRight"
        iconPosition="right"
        onClick={() => row.onClick()}
      >
        {t3({ en: "View", fr: "Voir", pt: "Ver" })}
      </Button>
    ),
  },
];

const STATUS_DOT: Record<RowStatus, string> = {
  ready: "bg-success",
  partial: "bg-warning",
  missing: "bg-danger",
  unset: "bg-base-content-faint",
};

function StatusMark(p: { status: RowStatus }) {
  const label = () => {
    switch (p.status) {
      case "ready":
        return t3({ en: "Ready", fr: "Prêt", pt: "Pronto" });
      case "partial":
        return t3({ en: "Partial", fr: "Partiel", pt: "Parcial" });
      case "missing":
        return t3({ en: "Missing", fr: "Manquant", pt: "Em falta" });
      case "unset":
        return t3({ en: "Not set", fr: "Non défini", pt: "Não definido" });
    }
  };
  return (
    <span class="text-base-content-muted ui-gap-sm inline-flex items-center text-nowrap">
      <span class={`h-2 w-2 flex-none rounded-full ${STATUS_DOT[p.status]}`} />
      {label()}
    </span>
  );
}
