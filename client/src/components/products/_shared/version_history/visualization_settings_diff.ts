import {
  canonicalJson,
  type DisaggregationDisplayOption,
  type DisaggregationOption,
  type FigureBundle,
  get_DISAGGREGATION_DISPLAY_OPTIONS,
  get_PRESENTATION_SELECT_OPTIONS,
  type PresentationObjectConfig,
  type PresentationOption,
  t3,
  type TranslatableString,
} from "lib";

// Which settings of a saved visualization changed between two versions, in
// the words of the figure editor's panels: one line per setting, with its
// value before and after when it has one to show (a setting added has no
// before, one removed no after; a structured setting such as conditional
// formatting says only that it changed). The labels that need instance or
// package state (a metric's name, a dimension's, a period's) are injected, so
// this stays a pure function of the two bundles.

export type SettingsSection = "data" | "style" | "text";

export type SettingChange = {
  section: SettingsSection;
  label: string;
  before?: string;
  after?: string;
};

export type SettingsLabels = {
  metric: (metricId: string) => string;
  dimension: (disOpt: DisaggregationOption) => string;
  period: (value: number) => string;
};

// More values than this in a filter are counted, not listed.
const MAX_LISTED_VALUES = 4;

export function diffVisualizationSettings(
  prev: FigureBundle,
  next: FigureBundle,
  labels: SettingsLabels,
): SettingChange[] {
  const out: SettingChange[] = [];
  if (prev.metricId !== next.metricId) {
    out.push({
      section: "data",
      label: t3({ en: "Metric", fr: "Indicateur", pt: "Métrica" }),
      before: labels.metric(prev.metricId),
      after: labels.metric(next.metricId),
    });
  }
  diffData(prev.config, next.config, labels, out);
  diffText(prev.config.t, next.config.t, out);
  diffStyle(prev.config.s, next.config.s, out);
  return out;
}

// ── Data ────────────────────────────────────────────────────────────────

function diffData(
  prev: PresentationObjectConfig,
  next: PresentationObjectConfig,
  labels: SettingsLabels,
  out: SettingChange[],
): void {
  const a = prev.d;
  const b = next.d;
  const push = (label: string, before?: string, after?: string) =>
    out.push({ section: "data", label, before, after });

  if (a.type !== b.type) {
    push(
      t3({
        en: "Presentation type",
        fr: "Type de présentation",
        pt: "Tipo de apresentação",
      }),
      presentationLabel(a.type),
      presentationLabel(b.type),
    );
  }
  if (a.valuesDisDisplayOpt !== b.valuesDisDisplayOpt) {
    push(
      t3({
        en: "Values shown as",
        fr: "Valeurs affichées en",
        pt: "Valores apresentados como",
      }),
      displayLabel(a.type, a.valuesDisDisplayOpt),
      displayLabel(b.type, b.valuesDisDisplayOpt),
    );
  }
  if (
    canonicalJson(a.valuesFilter ?? []) !== canonicalJson(b.valuesFilter ?? [])
  ) {
    push(
      t3({ en: "Values", fr: "Valeurs", pt: "Valores" }),
      a.valuesFilter ? listValues(a.valuesFilter) : allLabel(),
      b.valuesFilter ? listValues(b.valuesFilter) : allLabel(),
    );
  }

  // Disaggregations, by dimension: added, removed, shown differently, total
  // row toggled; a pure reorder is its own line.
  const prevDis = new Map(a.disaggregateBy.map((x) => [x.disOpt, x]));
  const nextDis = new Map(b.disaggregateBy.map((x) => [x.disOpt, x]));
  for (const [disOpt, x] of nextDis) {
    const old = prevDis.get(disOpt);
    const dim = labels.dimension(disOpt);
    if (!old) {
      push(
        `${
          t3({
            en: "Disaggregate by",
            fr: "Désagréger par",
            pt: "Desagregar por",
          })
        } ${dim}`,
        undefined,
        displayLabel(b.type, x.disDisplayOpt),
      );
      continue;
    }
    if (old.disDisplayOpt !== x.disDisplayOpt) {
      push(
        `${dim}: ${
          t3({ en: "shown as", fr: "affiché en", pt: "apresentado como" })
        }`,
        displayLabel(a.type, old.disDisplayOpt),
        displayLabel(b.type, x.disDisplayOpt),
      );
    }
    if ((old.rollup ?? false) !== (x.rollup ?? false)) {
      push(
        `${dim}: ${
          t3({ en: "total row", fr: "ligne de total", pt: "linha de total" })
        }`,
        onOff(old.rollup ?? false),
        onOff(x.rollup ?? false),
      );
    }
  }
  for (const [disOpt, x] of prevDis) {
    if (!nextDis.has(disOpt)) {
      push(
        `${
          t3({
            en: "Disaggregate by",
            fr: "Désagréger par",
            pt: "Desagregar por",
          })
        } ${labels.dimension(disOpt)}`,
        displayLabel(a.type, x.disDisplayOpt),
        undefined,
      );
    }
  }
  const sharedOrder = (
    list: typeof a.disaggregateBy,
    other: Map<unknown, unknown>,
  ) => list.filter((x) => other.has(x.disOpt)).map((x) => x.disOpt);
  const prevOrder = sharedOrder(a.disaggregateBy, nextDis);
  const nextOrder = sharedOrder(b.disaggregateBy, prevDis);
  if (prevOrder.join() !== nextOrder.join()) {
    push(
      t3({
        en: "Disaggregation order",
        fr: "Ordre des désagrégations",
        pt: "Ordem das desagregações",
      }),
      prevOrder.map(labels.dimension).join(", "),
      nextOrder.map(labels.dimension).join(", "),
    );
  }

  // Filters, by dimension.
  const prevFilters = new Map(a.filterBy.map((f) => [f.disOpt, f.values]));
  const nextFilters = new Map(b.filterBy.map((f) => [f.disOpt, f.values]));
  const filterLabel = (disOpt: DisaggregationOption) =>
    `${t3({ en: "Filter on", fr: "Filtre sur", pt: "Filtro em" })} ${
      labels.dimension(disOpt)
    }`;
  for (const [disOpt, values] of nextFilters) {
    const old = prevFilters.get(disOpt);
    if (!old) {
      push(filterLabel(disOpt), undefined, listValues(values));
    } else if (
      canonicalJson([...old].sort()) !== canonicalJson([...values].sort())
    ) {
      push(filterLabel(disOpt), listValues(old), listValues(values));
    }
  }
  for (const [disOpt, values] of prevFilters) {
    if (!nextFilters.has(disOpt)) {
      push(filterLabel(disOpt), listValues(values), undefined);
    }
  }

  if (
    canonicalJson(a.periodFilter ?? null) !==
      canonicalJson(b.periodFilter ?? null)
  ) {
    push(
      t3({ en: "Time period", fr: "Période", pt: "Período" }),
      periodFilterLabel(a.periodFilter, labels),
      periodFilterLabel(b.periodFilter, labels),
    );
  }
  if ((a.timeseriesGrouping ?? null) !== (b.timeseriesGrouping ?? null)) {
    push(
      t3({
        en: "Time grouping",
        fr: "Regroupement temporel",
        pt: "Agrupamento temporal",
      }),
      groupingLabel(a.timeseriesGrouping),
      groupingLabel(b.timeseriesGrouping),
    );
  }
  if (
    (a.selectedReplicantValue ?? null) !== (b.selectedReplicantValue ?? null)
  ) {
    push(
      t3({
        en: "Chart shown (replicant)",
        fr: "Graphique affiché (réplicant)",
        pt: "Gráfico apresentado (replicante)",
      }),
      a.selectedReplicantValue,
      b.selectedReplicantValue,
    );
  }
}

function presentationLabel(type: PresentationOption): string {
  return get_PRESENTATION_SELECT_OPTIONS().find((o) => o.value === type)
    ?.label ?? type;
}

function displayLabel(
  type: PresentationOption,
  opt: DisaggregationDisplayOption,
): string {
  const label = get_DISAGGREGATION_DISPLAY_OPTIONS()[type].find((o) =>
    o.value === opt
  )?.label;
  return label || opt;
}

function listValues(values: (string | number)[]): string {
  if (values.length > MAX_LISTED_VALUES) {
    return t3({
      en: `${values.length} values`,
      fr: `${values.length} valeurs`,
      pt: `${values.length} valores`,
    });
  }
  return values.map(String).join(", ");
}

function allLabel(): string {
  return t3({ en: "All", fr: "Toutes", pt: "Todos" });
}

function periodFilterLabel(
  pf: PresentationObjectConfig["d"]["periodFilter"],
  labels: SettingsLabels,
): string {
  if (pf === undefined) {
    return t3({ en: "All time", fr: "Toute la période", pt: "Todo o período" });
  }
  switch (pf.filterType) {
    case "last_n_months":
      return t3({
        en: `Last ${pf.nMonths} months`,
        fr: `${pf.nMonths} derniers mois`,
        pt: `Últimos ${pf.nMonths} meses`,
      });
    case "last_calendar_year":
      return t3({ en: "Last year", fr: "Dernière année", pt: "Último ano" });
    case "last_calendar_quarter":
      return t3({
        en: "Last quarter",
        fr: "Dernier trimestre",
        pt: "Último trimestre",
      });
    case "last_n_calendar_years":
      return t3({
        en: `Last ${pf.nYears} full calendar years`,
        fr: `${pf.nYears} dernières années civiles complètes`,
        pt: `Últimos ${pf.nYears} anos civis completos`,
      });
    case "last_n_calendar_quarters":
      return t3({
        en: `Last ${pf.nQuarters} full calendar quarters`,
        fr: `${pf.nQuarters} derniers trimestres civils complets`,
        pt: `Últimos ${pf.nQuarters} trimestres civis completos`,
      });
    case "from_month":
      return t3({
        en: `From ${labels.period(pf.min)}`,
        fr: `Depuis ${labels.period(pf.min)}`,
        pt: `Desde ${labels.period(pf.min)}`,
      });
    case "custom":
      return `${labels.period(pf.min)} – ${labels.period(pf.max)}`;
  }
}

function groupingLabel(
  grouping: PresentationObjectConfig["d"]["timeseriesGrouping"],
): string | undefined {
  switch (grouping) {
    case "period_id":
      return t3({ en: "Monthly", fr: "Mensuel", pt: "Mensal" });
    case "quarter_id":
      return t3({ en: "Quarterly", fr: "Trimestriel", pt: "Trimestral" });
    case "year":
      return t3({ en: "Yearly", fr: "Annuel", pt: "Anual" });
    default:
      return undefined;
  }
}

// ── Text ────────────────────────────────────────────────────────────────

const TEXT_LABELS: Record<
  keyof PresentationObjectConfig["t"],
  TranslatableString
> = {
  caption: { en: "Caption", fr: "Titre", pt: "Legenda" },
  captionRelFontSize: {
    en: "Caption size",
    fr: "Taille du titre",
    pt: "Tamanho da legenda",
  },
  subCaption: { en: "Sub-caption", fr: "Sous-titre", pt: "Sublegenda" },
  subCaptionRelFontSize: {
    en: "Sub-caption size",
    fr: "Taille du sous-titre",
    pt: "Tamanho da sublegenda",
  },
  footnote: { en: "Footnote", fr: "Note de bas de page", pt: "Nota de rodapé" },
  footnoteRelFontSize: {
    en: "Footnote size",
    fr: "Taille de la note",
    pt: "Tamanho da nota",
  },
};

function diffText(
  a: PresentationObjectConfig["t"],
  b: PresentationObjectConfig["t"],
  out: SettingChange[],
): void {
  for (const key of Object.keys(TEXT_LABELS) as (keyof typeof TEXT_LABELS)[]) {
    if (a[key] === b[key]) continue;
    const show = (v: string | number) =>
      typeof v === "string" && v.trim() === "" ? undefined : String(v);
    out.push({
      section: "text",
      label: t3(TEXT_LABELS[key]),
      before: show(a[key]),
      after: show(b[key]),
    });
  }
}

// ── Style ───────────────────────────────────────────────────────────────

type StyleConfig = PresentationObjectConfig["s"];

// The editor's label for each style setting. Settings not named here (and
// the flattened conditional-formatting fields, folded into one line) still
// report, under a generic label.
const STYLE_LABELS: Partial<Record<keyof StyleConfig, TranslatableString>> = {
  content: {
    en: "Display format",
    fr: "Format d'affichage",
    pt: "Formato de apresentação",
  },
  colorScale: {
    en: "Color scale",
    fr: "Échelle de couleurs",
    pt: "Escala de cores",
  },
  decimalPlaces: {
    en: "Decimal places",
    fr: "Décimales",
    pt: "Casas decimais",
  },
  hideLegend: {
    en: "Hide legend",
    fr: "Masquer la légende",
    pt: "Ocultar legenda",
  },
  showDataLabels: {
    en: "Show data labels",
    fr: "Afficher les étiquettes",
    pt: "Mostrar rótulos de dados",
  },
  showDataLabelsLineCharts: {
    en: "Show data labels",
    fr: "Afficher les étiquettes",
    pt: "Mostrar rótulos de dados",
  },
  barsStacked: {
    en: "Stacked bars",
    fr: "Barres empilées",
    pt: "Barras empilhadas",
  },
  horizontal: { en: "Horizontal", fr: "Horizontal", pt: "Horizontal" },
  verticalTickLabels: {
    en: "Vertical tick labels",
    fr: "Étiquettes verticales",
    pt: "Rótulos verticais",
  },
  allowVerticalColHeaders: {
    en: "Allow vertical column headers",
    fr: "Autoriser les en-têtes verticaux",
    pt: "Permitir cabeçalhos verticais",
  },
  showNValues: {
    en: "Show sample sizes in column headers",
    fr: "Afficher les effectifs dans les en-têtes",
    pt: "Mostrar tamanhos de amostra nos cabeçalhos",
  },
  forceYMax1: {
    en: "Force y-axis max of 100%",
    fr: "Forcer le max de l'axe y à 100 %",
    pt: "Forçar máximo do eixo y a 100%",
  },
  forceYMinAuto: {
    en: "Allow auto y-axis min",
    fr: "Min automatique de l'axe y",
    pt: "Mínimo automático do eixo y",
  },
  allowIndividualRowLimits: {
    en: "Allow individual row limits",
    fr: "Limites par rangée",
    pt: "Limites por linha",
  },
  sortIndicatorValues: {
    en: "Sort indicator values",
    fr: "Trier les valeurs",
    pt: "Ordenar valores",
  },
  nColsInCellDisplay: {
    en: "Number of grid columns",
    fr: "Nombre de colonnes de la grille",
    pt: "Número de colunas da grelha",
  },
  mapProjection: { en: "Map projection", fr: "Projection", pt: "Projeção" },
  mapShowRegionLabels: {
    en: "Show region labels",
    fr: "Afficher les noms des régions",
    pt: "Mostrar nomes das regiões",
  },
  mapDataLabelMode: {
    en: "Label placement",
    fr: "Placement des étiquettes",
    pt: "Posição dos rótulos",
  },
  pieInnerRadiusRatio: { en: "Shape", fr: "Forme", pt: "Forma" },
  pieGroupSmallSlices: {
    en: "Group small slices",
    fr: "Regrouper les petites tranches",
    pt: "Agrupar fatias pequenas",
  },
  pieCompletionMode: {
    en: "Show each value against 100%",
    fr: "Afficher chaque valeur sur 100 %",
    pt: "Mostrar cada valor face a 100%",
  },
  pieShowCenterValue: {
    en: "Show value in centre",
    fr: "Afficher la valeur au centre",
    pt: "Mostrar valor no centro",
  },
  specialBarChartDiffThreshold: {
    en: "Threshold value",
    fr: "Valeur seuil",
    pt: "Valor limiar",
  },
  customSeriesStyles: {
    en: "Series styles",
    fr: "Styles des séries",
    pt: "Estilos das séries",
  },
  customValueOrder: {
    en: "Custom value order",
    fr: "Ordre personnalisé des valeurs",
    pt: "Ordem personalizada dos valores",
  },
};

// Values worth naming; anything else is a plain string, a number or on/off.
const STYLE_VALUE_LABELS: Record<string, TranslatableString> = {
  bars: { en: "Bars", fr: "Barres", pt: "Barras" },
  lines: { en: "Lines", fr: "Lignes", pt: "Linhas" },
  points: { en: "Points", fr: "Points", pt: "Pontos" },
  "lines-area": {
    en: "Filled area",
    fr: "Aire remplie",
    pt: "Área preenchida",
  },
  "lines-points": {
    en: "Lines with points",
    fr: "Lignes avec points",
    pt: "Linhas com pontos",
  },
  "points-connectors": {
    en: "Points with connectors",
    fr: "Points reliés",
    pt: "Pontos com ligações",
  },
  ascending: { en: "Ascending", fr: "Croissant", pt: "Ascendente" },
  descending: { en: "Descending", fr: "Décroissant", pt: "Descendente" },
  none: { en: "None", fr: "Aucun", pt: "Nenhum" },
  auto: { en: "Auto", fr: "Auto", pt: "Auto" },
  custom: { en: "Custom", fr: "Personnalisé", pt: "Personalizado" },
  "pastel-discrete": { en: "Discrete 1", fr: "Discret 1", pt: "Discreto 1" },
  "alt-discrete": { en: "Discrete 2", fr: "Discret 2", pt: "Discreto 2" },
  "red-green": { en: "Red-green", fr: "Rouge-vert", pt: "Vermelho-verde" },
  "blue-green": { en: "Blue-green", fr: "Bleu-vert", pt: "Azul-verde" },
  "single-grey": { en: "Single grey", fr: "Gris simple", pt: "Cinzento único" },
  equirectangular: {
    en: "Equirectangular",
    fr: "Équirectangulaire",
    pt: "Equirretangular",
  },
  mercator: { en: "Mercator", fr: "Mercator", pt: "Mercator" },
  naturalEarth1: {
    en: "Natural Earth",
    fr: "Natural Earth",
    pt: "Natural Earth",
  },
  centroid: { en: "Center", fr: "Centre", pt: "Centro" },
  callout: { en: "Callout", fr: "Légende", pt: "Chamada" },
};

function diffStyle(a: StyleConfig, b: StyleConfig, out: SettingChange[]) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof StyleConfig
  >;
  let cfChanged = false;
  let otherChanged = false;
  for (const key of keys) {
    if (
      canonicalJson(styleOrEmpty(a[key])) ===
        canonicalJson(styleOrEmpty(b[key]))
    ) {
      continue;
    }
    if (key.startsWith("cf")) {
      cfChanged = true;
      continue;
    }
    const label = STYLE_LABELS[key];
    if (!label) {
      otherChanged = true;
      continue;
    }
    out.push({
      section: "style",
      label: t3(label),
      before: styleValue(a[key]),
      after: styleValue(b[key]),
    });
  }
  if (cfChanged) {
    out.push({
      section: "style",
      label: t3({
        en: "Conditional formatting",
        fr: "Mise en forme conditionnelle",
        pt: "Formatação condicional",
      }),
    });
  }
  if (otherChanged) {
    out.push({
      section: "style",
      label: t3({
        en: "Other style settings",
        fr: "Autres réglages de style",
        pt: "Outras definições de estilo",
      }),
    });
  }
}

// The optional style settings are read as `?? false`, `?? 0` or `?? []`
// (see presentationObjectConfigSStrict), so an absent one equals its empty
// value: a setting first written as off is not a change.
function styleOrEmpty(v: unknown): unknown {
  if (
    v === undefined || v === null || v === false || v === 0 ||
    (Array.isArray(v) && v.length === 0)
  ) {
    return null;
  }
  return v;
}

// Undefined for a structured value: the line then says only that it changed.
function styleValue(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "boolean") return onOff(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const named = STYLE_VALUE_LABELS[v];
    return named ? t3(named) : v;
  }
  return undefined;
}

function onOff(v: boolean): string {
  return v
    ? t3({ en: "On", fr: "Activé", pt: "Ativado" })
    : t3({ en: "Off", fr: "Désactivé", pt: "Desativado" });
}
