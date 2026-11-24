import type { TranslatableString } from "../translate/types.ts";
import { PERIOD_DISAGGREGATION_OPTIONS } from "../types/disaggregation_options.ts";
import {
  type Dim,
  type FigureType,
  type TimeseriesMode,
  VALUE_PROPS,
} from "./schema.ts";
import type { FigureConfigProblem } from "./validate.ts";

type Words = { en: string; fr: string; pt: string };

const GRID: Words = { en: "Grid", fr: "Grille", pt: "Grelha" };
const ROWS: Words = { en: "Rows", fr: "Rangées", pt: "Linhas" };
const COLUMNS: Words = { en: "Columns", fr: "Colonnes", pt: "Colunas" };

// The names the editor gives each place a dimension can take, by figure type.
const PLACE_WORDS: Record<FigureType, Record<string, Words>> = {
  table: {
    row: ROWS,
    col: COLUMNS,
    rowGroup: {
      en: "Row groups",
      fr: "Catégories de rangées",
      pt: "Grupos de linhas",
    },
    colGroup: {
      en: "Column groups",
      fr: "Groupes de colonnes",
      pt: "Grupos de colunas",
    },
  },
  timeseries: {
    period: { en: "Time axis", fr: "Axe du temps", pt: "Eixo do tempo" },
    series: { en: "Lines", fr: "Lignes", pt: "Linhas" },
    pane: GRID,
    tier: ROWS,
    lane: COLUMNS,
  },
  chart: {
    indicator: { en: "Bars", fr: "Barres", pt: "Barras" },
    series: {
      en: "Series (sub-bars)",
      fr: "Séries (sous-barres)",
      pt: "Séries (sub-barras)",
    },
    pane: GRID,
    tier: ROWS,
    lane: COLUMNS,
  },
  map: {
    mapArea: {
      en: "Map regions",
      fr: "Régions de la carte",
      pt: "Regiões do mapa",
    },
    pane: GRID,
    tier: ROWS,
    lane: COLUMNS,
  },
  pie: {
    series: { en: "Slices", fr: "Tranches", pt: "Fatias" },
    indicator: { en: "Pies", fr: "Camemberts", pt: "Circulares" },
    pane: GRID,
    tier: ROWS,
    lane: COLUMNS,
  },
};

const REPLICANT: Words = {
  en: "Different charts (replicants)",
  fr: "Graphiques multiples (réplicants)",
  pt: "Gráficos diferentes (replicantes)",
};

const TYPE_WORDS: Record<FigureType, Words> = {
  table: { en: "table", fr: "tableau", pt: "tabela" },
  timeseries: {
    en: "time series",
    fr: "série temporelle",
    pt: "série temporal",
  },
  chart: { en: "chart", fr: "graphique", pt: "gráfico" },
  map: { en: "map", fr: "carte", pt: "mapa" },
  pie: { en: "pie", fr: "camembert", pt: "gráfico circular" },
};

const MODE_WORDS: Record<Exclude<TimeseriesMode, "standard">, Words> = {
  coverage: {
    en: "coverage chart",
    fr: "graphique de couverture",
    pt: "gráfico de cobertura",
  },
  percentChange: {
    en: "percent change chart",
    fr: "graphique de variation en pourcentage",
    pt: "gráfico de variação percentual",
  },
  disruptions: {
    en: "disruptions chart",
    fr: "graphique des perturbations",
    pt: "gráfico de perturbações",
  },
  disruptionsBand: {
    en: "disruptions band chart",
    fr: "graphique de bande des perturbations",
    pt: "gráfico de banda de perturbações",
  },
};

function placeWords(type: FigureType, place: string): Words {
  if (place === "replicant") return REPLICANT;
  return PLACE_WORDS[type][place] ?? { en: place, fr: place, pt: place };
}

// What the editor shows, and the copilot's refusal returns, for one problem of
// a figure of `type`. `dimLabel` names a dimension as the instance labels it.
export function describeFigureConfigProblem(
  problem: FigureConfigProblem,
  type: FigureType,
  dimLabel: (dim: Dim) => TranslatableString,
): TranslatableString {
  const name = (dim: Dim): Words => {
    const s = dimLabel(dim);
    return { en: s.en, fr: s.fr, pt: s.pt ?? s.en };
  };
  switch (problem.kind) {
    case "shape":
      return {
        en: `A setting is missing or not valid (${problem.path}).`,
        fr: `Un paramètre est manquant ou non valide (${problem.path}).`,
        pt: `Uma definição está em falta ou não é válida (${problem.path}).`,
      };
    case "onTwoPlaces": {
      const [a, b] = problem.places.map((p) => placeWords(type, p));
      const what = problem.holds === VALUE_PROPS
        ? { en: "the values", fr: "les valeurs", pt: "os valores" }
        : name(problem.holds);
      return {
        en: `Laid out twice: ${what.en}, in ${a.en} and ${b.en}.`,
        fr: `Placé deux fois : ${what.fr}, dans ${a.fr} et ${b.fr}.`,
        pt: `Colocado duas vezes: ${what.pt}, em ${a.pt} e ${b.pt}.`,
      };
    }
    case "rollupOffLayout": {
      const d = name(problem.dim);
      return {
        en: `The total row is for ${d.en}, which is not laid out.`,
        fr:
          `La ligne de total porte sur ${d.fr}, qui ne figure pas dans la disposition.`,
        pt: `A linha de total é para ${d.pt}, que não consta da disposição.`,
      };
    }
    case "twoFilters": {
      const d = name(problem.dim);
      return {
        en: `${d.en} has two filters.`,
        fr: `${d.fr} a deux filtres.`,
        pt: `${d.pt} tem dois filtros.`,
      };
    }
    case "periodRange":
      return {
        en:
          "The time period must start and end on periods of one kind, with the start first.",
        fr:
          "La période doit commencer et finir sur des périodes du même type, le début en premier.",
        pt:
          "O período tem de começar e acabar em períodos do mesmo tipo, com o início primeiro.",
      };
    case "thresholdsBuckets":
      return {
        en: "The colour thresholds need one more colour than cut-off values.",
        fr:
          "Les seuils de couleur demandent une couleur de plus que de valeurs seuils.",
        pt:
          "Os limiares de cor precisam de mais uma cor do que valores de corte.",
      };
    case "thresholdsDescend":
      return {
        en: "The colour thresholds' cut-off values must not decrease.",
        fr: "Les valeurs seuils des couleurs ne doivent pas diminuer.",
        pt: "Os valores de corte dos limiares de cor não podem diminuir.",
      };
    case "scaleDomain":
      return {
        en: "The colour scale's minimum must be below its maximum.",
        fr:
          "Le minimum de l'échelle de couleur doit être inférieur à son maximum.",
        pt: "O mínimo da escala de cor tem de ser inferior ao máximo.",
      };
    case "unknownValueProp":
      return {
        en: `This metric has no value "${problem.valueProp}".`,
        fr: `Cet indicateur n'a pas de valeur « ${problem.valueProp} ».`,
        pt: `Esta métrica não tem o valor "${problem.valueProp}".`,
      };
    case "unknownDim": {
      const d = name(problem.dim);
      return {
        en: `This metric has no dimension ${d.en}.`,
        fr: `Cet indicateur n'a pas la dimension ${d.fr}.`,
        pt: `Esta métrica não tem a dimensão ${d.pt}.`,
      };
    }
    case "filterOnlyLaidOut": {
      const d = name(problem.dim);
      return {
        en: `${d.en} can only filter the figure, not be laid out.`,
        fr: `${d.fr} sert uniquement de filtre et ne peut pas être disposé.`,
        pt: `${d.pt} só pode filtrar a figura, não ser disposto.`,
      };
    }
    case "dimNotOnType": {
      const d = name(problem.dim);
      const t = TYPE_WORDS[type];
      return {
        en: `${d.en} cannot be laid out on a ${t.en}.`,
        fr:
          `${d.fr} ne peut pas être disposé dans ce type de figure (${t.fr}).`,
        pt: `${d.pt} não pode ser disposto neste tipo de figura (${t.pt}).`,
      };
    }
    case "valuePropsOnNoSlot":
      return {
        en: "Two or more values are shown, and no place is set for them.",
        fr:
          "Plusieurs valeurs sont affichées, sans emplacement prévu pour elles.",
        pt:
          "São mostrados dois ou mais valores sem um lugar definido para eles.",
      };
    case "chartIndicatorEmpty":
      return {
        en: "The values are in another place, so the bars need a dimension.",
        fr:
          "Les valeurs sont placées ailleurs : les barres demandent une dimension.",
        pt:
          "Os valores estão noutro lugar, por isso as barras precisam de uma dimensão.",
      };
    case "mapValueProps":
      return {
        en: "A map shows exactly one value.",
        fr: "Une carte affiche exactement une valeur.",
        pt: "Um mapa mostra exatamente um valor.",
      };
    case "requiredPooled": {
      const d = name(problem.dim);
      const period = PERIOD_DISAGGREGATION_OPTIONS.has(problem.dim);
      return {
        en: `This metric must show each ${d.en} apart: ${
          period
            ? "lay it out, or show one period"
            : "lay it out, make it the replicant, or filter it to one value"
        }.`,
        fr: `Cet indicateur doit montrer chaque ${d.fr} à part : ${
          period
            ? "disposez-le, ou montrez une seule période"
            : "disposez-le, faites-en le réplicant, ou filtrez-le sur une seule valeur"
        }.`,
        pt: `Esta métrica tem de mostrar cada ${d.pt} em separado: ${
          period
            ? "disponha-a, ou mostre um só período"
            : "disponha-a, torne-a o replicante, ou filtre-a para um só valor"
        }.`,
      };
    }
    case "periodFilterOfYearlyData":
      return {
        en:
          "This data is yearly: choose a range of years or the last full year.",
        fr:
          "Ces données sont annuelles : choisissez une plage d'années ou la dernière année complète.",
        pt:
          "Estes dados são anuais: escolha um intervalo de anos ou o último ano completo.",
      };
    case "periodFilterWithoutTime":
      return {
        en: "This metric has no time column, so it takes no time period.",
        fr:
          "Cet indicateur n'a pas de colonne de temps et ne prend donc pas de période.",
        pt:
          "Esta métrica não tem coluna de tempo, por isso não admite um período.",
      };
    case "rollupNotEligible":
      return {
        en:
          "This metric's values cannot be totalled, so it takes no total row.",
        fr:
          "Les valeurs de cet indicateur ne peuvent pas être totalisées : il ne prend pas de ligne de total.",
        pt:
          "Os valores desta métrica não podem ser totalizados, por isso não admite linha de total.",
      };
    case "modeNotOfMetric": {
      const m = MODE_WORDS[problem.mode];
      return {
        en: `The ${m.en} is not available for this metric.`,
        fr:
          `Ce type de graphique (${m.fr}) n'est pas disponible pour cet indicateur.`,
        pt:
          `Este tipo de gráfico (${m.pt}) não está disponível para esta métrica.`,
      };
    }
    case "modeSeriesDim": {
      const m = MODE_WORDS[problem.mode];
      return {
        en: `A ${m.en} draws its own lines, so no dimension can go on Lines.`,
        fr:
          `Ce type de graphique (${m.fr}) dessine ses propres lignes : aucune dimension ne peut aller dans Lignes.`,
        pt:
          `Este tipo de gráfico (${m.pt}) desenha as suas próprias linhas: nenhuma dimensão pode ir para Linhas.`,
      };
    }
    case "modeValuePropsSlot": {
      const m = MODE_WORDS[problem.mode];
      return {
        en: `A ${m.en} draws its values as its lines: put the values on Lines.`,
        fr:
          `Ce type de graphique (${m.fr}) dessine ses valeurs comme ses lignes : placez les valeurs dans Lignes.`,
        pt:
          `Este tipo de gráfico (${m.pt}) desenha os seus valores como linhas: coloque os valores em Linhas.`,
      };
    }
    case "modeValueProps": {
      const m = MODE_WORDS[problem.mode];
      const band = problem.mode === "disruptionsBand";
      return {
        en: `A ${m.en} needs ${
          band ? "exactly its four values, in order" : "two or more values"
        }.`,
        fr: `Ce type de graphique (${m.fr}) a besoin ${
          band
            ? "exactement de ses quatre valeurs, dans l'ordre"
            : "d'au moins deux valeurs"
        }.`,
        pt: `Este tipo de gráfico (${m.pt}) precisa ${
          band
            ? "exatamente dos seus quatro valores, por ordem"
            : "de dois ou mais valores"
        }.`,
      };
    }
    case "indicatorColoring":
      return {
        en:
          "Colouring by each indicator's own rule needs a metric whose values are indicators.",
        fr:
          "La coloration selon la règle propre à chaque indicateur demande des valeurs qui sont des indicateurs.",
        pt:
          "Colorir segundo a regra de cada indicador exige uma métrica cujos valores sejam indicadores.",
      };
  }
}
