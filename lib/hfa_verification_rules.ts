import type { TranslatableString } from "./translate/mod.ts";

// What the HFA indicator verification checks, the one statement of it: the
// instruction block lists the model rules, the code editor shows a finding
// beside its rule's field, and the rules modal shows every rule. The app
// rules are the status core's issue kinds, listed so the modal says what is
// checked without a run and the model is told not to repeat them.

export const HFA_VERIFICATION_RULE_GROUPS = {
  labels: { en: "Labels", fr: "Libellés", pt: "Rótulos" },
  variables: { en: "Variables", fr: "Variables", pt: "Variáveis" },
  logic: { en: "Code logic", fr: "Logique du code", pt: "Lógica do código" },
  filter: { en: "Filter", fr: "Filtre", pt: "Filtro" },
  type: {
    en: "Type and aggregation",
    fr: "Type et agrégation",
    pt: "Tipo e agregação",
  },
  rounds: { en: "Rounds", fr: "Rounds", pt: "Rondas" },
  category: { en: "Category", fr: "Catégorie", pt: "Categoria" },
  variants: { en: "Variants", fr: "Variantes", pt: "Variantes" },
} as const satisfies Record<string, TranslatableString>;

export type HfaVerificationRuleGroup =
  keyof typeof HFA_VERIFICATION_RULE_GROUPS;

export const HFA_VERIFICATION_SEVERITIES = {
  problem: { en: "Problem", fr: "Problème", pt: "Problema" },
  warning: { en: "Warning", fr: "Avertissement", pt: "Aviso" },
} as const satisfies Record<string, TranslatableString>;

export type HfaVerificationSeverity = keyof typeof HFA_VERIFICATION_SEVERITIES;

// The code editor field a finding shows beside; `rounds` is the round list.
export type HfaVerificationField =
  | "shortLabel"
  | "definition"
  | "type"
  | "category"
  | "code"
  | "filterCode"
  | "variantCode"
  | "rounds";

type HfaVerificationRuleEntry = {
  id: string;
  group: HfaVerificationRuleGroup;
  checker: "app" | "model";
  severity: HfaVerificationSeverity;
  field: HfaVerificationField;
  text: TranslatableString;
};

export const HFA_VERIFICATION_RULES = [
  {
    id: "syntax",
    group: "logic",
    checker: "app",
    severity: "problem",
    field: "code",
    text: {
      en: "The code follows the language: it reads without a syntax error.",
      fr: "Le code respecte le langage : il se lit sans erreur de syntaxe.",
      pt: "O código respeita a linguagem: lê-se sem erro de sintaxe.",
    },
  },
  {
    id: "unknown_variable",
    group: "variables",
    checker: "app",
    severity: "problem",
    field: "code",
    text: {
      en: "Every name in the code is a variable of that round or an indicator.",
      fr:
        "Chaque nom dans le code est une variable de ce round ou un indicateur.",
      pt: "Cada nome no código é uma variável dessa ronda ou um indicador.",
    },
  },
  {
    id: "filter_without_code",
    group: "filter",
    checker: "app",
    severity: "problem",
    field: "filterCode",
    text: {
      en: "A round with filter code also has indicator code.",
      fr: "Un round avec un code filtre a aussi un code d'indicateur.",
      pt: "Uma ronda com código de filtro tem também código do indicador.",
    },
  },
  {
    id: "variant_without_code",
    group: "variants",
    checker: "app",
    severity: "problem",
    field: "variantCode",
    text: {
      en: "A round with variant code also has indicator code.",
      fr: "Un round avec un code de variante a aussi un code d'indicateur.",
      pt: "Uma ronda com código de variante tem também código do indicador.",
    },
  },
  {
    id: "cycle",
    group: "logic",
    checker: "app",
    severity: "problem",
    field: "code",
    text: {
      en: "Indicators do not name each other in a loop.",
      fr: "Les indicateurs ne se nomment pas les uns les autres en boucle.",
      pt: "Os indicadores não se nomeiam uns aos outros em ciclo.",
    },
  },
  {
    id: "result_type",
    group: "type",
    checker: "app",
    severity: "warning",
    field: "code",
    text: {
      en: "Yes/no (binary) code is a condition; numeric code gives a number.",
      fr:
        "Le code oui/non (binaire) est une condition ; le code numérique donne un nombre.",
      pt:
        "O código sim/não (binário) é uma condição; o código numérico dá um número.",
    },
  },
  // The parser accepts a quoted value under a comparison and in an IN list,
  // and the status core does not warn on one yet, so nothing checks this.
  // {
  //   id: "quoted_value",
  //   group: "logic",
  //   checker: "app",
  //   severity: "warning",
  //   field: "code",
  //   text: {
  //     en: "No comparison is made against a quoted value.",
  //     fr: "Aucune comparaison ne porte sur une valeur entre guillemets.",
  //     pt: "Nenhuma comparação é feita com um valor entre aspas.",
  //   },
  // },
  {
    id: "label_measure_phrase",
    group: "labels",
    checker: "model",
    severity: "warning",
    field: "definition",
    text: {
      en:
        'Neither label contains the measure phrase ("% of facilities", "number of", "average"): it is added when the indicator is shown.',
      fr:
        "Aucun libellé ne contient la formule de mesure (« % des établissements », « nombre de », « moyenne ») : elle est ajoutée à l'affichage.",
      pt:
        'Nenhum rótulo contém a expressão de medida ("% de estabelecimentos", "número de", "média"): ela é acrescentada na apresentação.',
    },
  },
  {
    id: "label_matches_code",
    group: "labels",
    checker: "model",
    severity: "problem",
    field: "definition",
    text: {
      en:
        "The long label says exactly what the code computes: the condition, the threshold and the items.",
      fr:
        "Le libellé long dit exactement ce que le code calcule : la condition, le seuil et les éléments.",
      pt:
        "O rótulo longo diz exatamente o que o código calcula: a condição, o limiar e os itens.",
    },
  },
  {
    id: "label_denominator_matches_filter",
    group: "labels",
    checker: "model",
    severity: "problem",
    field: "filterCode",
    text: {
      en:
        'An "among ..." qualifier in the long label has a filter that implements it, and a filter has its qualifier in the label.',
      fr:
        "Une précision « parmi ... » dans le libellé long a un filtre qui l'applique, et un filtre a sa précision dans le libellé.",
      pt:
        'Uma restrição "entre ..." no rótulo longo tem um filtro que a aplica, e um filtro tem a sua restrição no rótulo.',
    },
  },
  {
    id: "short_label_consistent",
    group: "labels",
    checker: "model",
    severity: "warning",
    field: "shortLabel",
    text: {
      en:
        "The short label is a shortening of the long label, not a different measure.",
      fr: "Le libellé court abrège le libellé long, sans changer de mesure.",
      pt: "O rótulo curto abrevia o rótulo longo, sem mudar de medida.",
    },
  },
  {
    id: "variable_matches_intent",
    group: "variables",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en:
        "Each variable the code names is the question the label refers to, judged by the variable's label.",
      fr:
        "Chaque variable nommée dans le code est la question dont parle le libellé, d'après le libellé de la variable.",
      pt:
        "Cada variável nomeada no código é a pergunta de que fala o rótulo, a julgar pelo rótulo da variável.",
    },
  },
  {
    id: "better_variable_exists",
    group: "variables",
    checker: "model",
    severity: "warning",
    field: "code",
    text: {
      en: "No other variable in the dictionary matches the label more exactly.",
      fr:
        "Aucune autre variable du dictionnaire ne correspond plus exactement au libellé.",
      pt:
        "Nenhuma outra variável do dicionário corresponde mais exatamente ao rótulo.",
    },
  },
  {
    id: "option_code_matches",
    group: "variables",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en:
        "Each value compared against is a real option code of its variable, with the meaning the label needs (== 1 where 1 is Yes).",
      fr:
        "Chaque valeur comparée est un vrai code d'option de sa variable, avec le sens que le libellé demande (== 1 quand 1 est Oui).",
      pt:
        "Cada valor comparado é um código de opção real da sua variável, com o significado que o rótulo pede (== 1 quando 1 é Sim).",
    },
  },
  {
    id: "variable_blank",
    group: "variables",
    checker: "model",
    severity: "warning",
    field: "code",
    text: {
      en: "No variable the code names is blank in every round it is used in.",
      fr:
        "Aucune variable nommée dans le code n'est vide dans tous les rounds où elle sert.",
      pt:
        "Nenhuma variável nomeada no código está vazia em todas as rondas em que é usada.",
    },
  },
  {
    id: "positive_test",
    group: "logic",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en:
        "Conditions test for yes positively (x == 1, x >= 3), never by negation, in the filter too.",
      fr:
        "Les conditions testent le oui positivement (x == 1, x >= 3), jamais par une négation, y compris dans le filtre.",
      pt:
        "As condições testam o sim pela positiva (x == 1, x >= 3), nunca por negação, também no filtro.",
    },
  },
  {
    id: "sentinel_in_numeric",
    group: "logic",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en:
        "A numeric sum or average does not include a variable whose kept sentinel codes (other, not applicable, question-specific) would be summed as values.",
      fr:
        "Une somme ou une moyenne numérique n'inclut pas de variable dont les codes sentinelles conservés (autre, non applicable, propre à la question) seraient additionnés comme des valeurs.",
      pt:
        "Uma soma ou média numérica não inclui uma variável cujos códigos sentinela mantidos (outro, não aplicável, específico da pergunta) seriam somados como valores.",
    },
  },
  {
    id: "all_any_logic",
    group: "logic",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en: '"All of" is AND and "any of" is OR, as the label says.',
      fr:
        "« Tous » est AND et « au moins un » est OR, comme le dit le libellé.",
      pt: '"Todos" é AND e "pelo menos um" é OR, como diz o rótulo.',
    },
  },
  {
    id: "threshold_matches_label",
    group: "logic",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en: "A threshold in the code equals the one the label states.",
      fr: "Un seuil dans le code est égal à celui que le libellé indique.",
      pt: "Um limiar no código é igual ao que o rótulo indica.",
    },
  },
  {
    id: "items_match_label",
    group: "logic",
    checker: "model",
    severity: "problem",
    field: "code",
    text: {
      en: "Where the label or the code lists items, the two lists agree.",
      fr:
        "Quand le libellé ou le code énumère des éléments, les deux listes concordent.",
      pt:
        "Quando o rótulo ou o código enumera itens, as duas listas coincidem.",
    },
  },
  {
    id: "filter_yes_no",
    group: "filter",
    checker: "model",
    severity: "problem",
    field: "filterCode",
    text: {
      en: "The filter is a yes/no condition.",
      fr: "Le filtre est une condition oui/non.",
      pt: "O filtro é uma condição sim/não.",
    },
  },
  {
    id: "type_matches_measure",
    group: "type",
    checker: "model",
    severity: "problem",
    field: "type",
    text: {
      en:
        '"% of facilities" is yes/no (binary) with average; "average per facility" is numeric with average; a total is numeric with sum.',
      fr:
        "« % des établissements » est oui/non (binaire) avec moyenne ; « moyenne par établissement » est numérique avec moyenne ; un total est numérique avec somme.",
      pt:
        '"% de estabelecimentos" é sim/não (binário) com média; "média por estabelecimento" é numérico com média; um total é numérico com soma.',
    },
  },
  {
    id: "rounds_consistent",
    group: "rounds",
    checker: "model",
    severity: "problem",
    field: "rounds",
    text: {
      en:
        "The code is identical across rounds unless the round's question changed; where it changed, the round's code follows the change.",
      fr:
        "Le code est identique d'un round à l'autre sauf si la question du round a changé ; là où elle a changé, le code du round suit le changement.",
      pt:
        "O código é idêntico entre rondas, salvo se a pergunta da ronda mudou; onde mudou, o código da ronda acompanha a mudança.",
    },
  },
  {
    id: "round_coverage",
    group: "rounds",
    checker: "model",
    severity: "warning",
    field: "rounds",
    text: {
      en: "Every round whose variables exist has code.",
      fr: "Chaque round dont les variables existent a du code.",
      pt: "Cada ronda cujas variáveis existem tem código.",
    },
  },
  {
    id: "category_fits",
    group: "category",
    checker: "model",
    severity: "warning",
    field: "category",
    text: {
      en:
        "The category, sub-category and service categories match the indicator's subject.",
      fr:
        "La catégorie, la sous-catégorie et les catégories de service correspondent au sujet de l'indicateur.",
      pt:
        "A categoria, a subcategoria e as categorias de serviço correspondem ao tema do indicador.",
    },
  },
  {
    id: "variant_items_consistent",
    group: "variants",
    checker: "model",
    severity: "problem",
    field: "variantCode",
    text: {
      en:
        "Each item's code is the main measure restricted to that item; the main code is not derived from the items.",
      fr:
        "Le code de chaque élément est la mesure principale restreinte à cet élément ; le code principal n'est pas dérivé des éléments.",
      pt:
        "O código de cada item é a medida principal restrita a esse item; o código principal não é derivado dos itens.",
    },
  },
] as const satisfies readonly HfaVerificationRuleEntry[];

export type HfaVerificationRule = (typeof HFA_VERIFICATION_RULES)[number];
export type HfaVerificationRuleId = HfaVerificationRule["id"];
type HfaVerificationModelRule = Extract<
  HfaVerificationRule,
  { checker: "model" }
>;
export type HfaVerificationModelRuleId = HfaVerificationModelRule["id"];

export const HFA_VERIFICATION_MODEL_RULE_IDS: HfaVerificationModelRuleId[] =
  HFA_VERIFICATION_RULES
    .filter((r): r is HfaVerificationModelRule => r.checker === "model")
    .map((r) => r.id);

const RULES_BY_ID = new Map<HfaVerificationRuleId, HfaVerificationRule>(
  HFA_VERIFICATION_RULES.map((r) => [r.id, r]),
);

export function hfaVerificationRule(
  id: HfaVerificationRuleId,
): HfaVerificationRule {
  return RULES_BY_ID.get(id)!;
}
