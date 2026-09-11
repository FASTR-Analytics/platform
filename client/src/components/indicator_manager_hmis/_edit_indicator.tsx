// Create/update one indicator. The form branches on what the indicator IS
// (PLAN_A4 §2): a base is a count filled from DHIS2 (its `dhis2_id`) or by
// CSV upload (none), a sum is the total of other bases, a derived one is a
// formula over other indicators and population terms with a free display
// format. Every indicator carries the include-in-analysis checkbox (ruling
// 3). The palette below the formula inserts correctly written identifiers,
// and the legend names every identifier the formula references.
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  createFormAction,
  Input,
  LabelHolder,
  MultiSelectSearch,
  Select,
  SelectSearch,
  TextArea,
} from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  buildCommonIndicatorDictionary,
  type CommonIndicator,
  collectIdentifiers,
  type CommonIndicatorDefinition,
  type CommonIndicatorType,
  type DerivedIndicatorComputability,
  getLanguage,
  getNewIndicatorIdIssue,
  getSpecialIndicatorTypeIssue,
  type IndicatorFormat,
  isDhis2ShapedId,
  isPopulationTypeId,
  isSpecialIndicatorId,
  judgeDerivedIndicator,
  parseIndicatorExpression,
  POPULATION_TYPE_IDS,
  populationTypeLabel,
  RESERVED_WORDS,
  SPECIAL_INDICATOR_IDS,
  t3,
  TC,
  type ThresholdsRule,
  thresholdsRuleSchema,
  trafficLightLabels,
  unscaleValueForFormat,
  writeIdentifier,
} from "lib";
import { ThresholdsPanel } from "~/components/visualization/conditional_formatting_editor";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  computabilityProblemText,
  populationCoverageSummary,
} from "./_computability";

// The rule a fresh "Set" starts from: three traffic-light bands at 70 / 80 in
// the indicator's own display units, labelled in the UI language.
function defaultIndicatorRule(formatAs: IndicatorFormat): ThresholdsRule {
  const labels = trafficLightLabels(getLanguage());
  return {
    cutoffs: [
      unscaleValueForFormat(70, formatAs),
      unscaleValueForFormat(80, formatAs),
    ],
    buckets: [
      { color: _CF_LIGHTER_RED, label: labels.red },
      { color: _CF_LIGHTER_YELLOW, label: labels.yellow },
      { color: _CF_LIGHTER_GREEN, label: labels.green },
    ],
    direction: "higher-is-better",
  };
}

const TYPE_OPTIONS: { value: CommonIndicatorType; label: string }[] = [
  {
    value: "base",
    label: t3({
      en: "Base: a count filled from DHIS2 or by CSV upload",
      fr: "De base : un dénombrement rempli depuis DHIS2 ou par téléversement CSV",
      pt: "Base: uma contagem preenchida a partir do DHIS2 ou por carregamento CSV",
    }),
  },
  {
    value: "sum",
    label: t3({
      en: "Sum: the total of other base indicators",
      fr: "Somme : le total d'autres indicateurs de base",
      pt: "Soma: o total de outros indicadores de base",
    }),
  },
  {
    value: "derived",
    label: t3({
      en: "Derived: a formula over other indicators and populations",
      fr: "Dérivé : une formule sur d'autres indicateurs et des populations",
      pt: "Derivado: uma fórmula sobre outros indicadores e populações",
    }),
  },
];

const FORMAT_OPTIONS = [
  { value: "number", label: t3({ en: "Number", fr: "Nombre", pt: "Número" }) },
  {
    value: "percent",
    label: t3({ en: "Percent", fr: "Pourcentage", pt: "Percentagem" }),
  },
  {
    value: "rate_per_10k",
    label: t3({
      en: "Rate per 10,000",
      fr: "Taux pour 10 000",
      pt: "Taxa por 10 000",
    }),
  },
];

type LegendRow = {
  identifier: string;
  kind: "indicator" | "population";
  label: string | undefined;
  // Population rows only: what the store holds for the type, so the author
  // sees a gap here rather than at generation (which is where it is
  // enforced: PLAN_1b ruling 6). Display only; never a save rule.
  coverage?: { text: string; empty: boolean };
};

export function EditIndicatorForm(
  p: AlertComponentProps<
    {
      indicators: CommonIndicator[];
      // The bases and sums that have rows, as the manager knows them from the
      // ledger; undefined while it is still loading, when no ingredient is
      // judged to be missing data.
      idsWithData: Set<string> | undefined;
      existingIndicator?: CommonIndicator;
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";
  const existing = p.existingIndicator;
  let formulaHolder: HTMLDivElement | undefined;

  const [indicatorId, setIndicatorId] = createSignal(
    existing?.indicator_common_id || "",
  );
  const [indicatorLabel, setIndicatorLabel] = createSignal(
    existing?.indicator_common_label || "",
  );
  const [type, setType] = createSignal<CommonIndicatorType>(
    existing?.definition.type ?? "base",
  );
  const [dhis2Id, setDhis2Id] = createSignal(
    existing?.definition.type === "base" ? existing.definition.dhis2_id ?? "" : "",
  );
  // Read-only once set (ruling 6): the data under the base was fetched for it.
  const dhis2IdLocked = existing?.definition.type === "base" &&
    existing.definition.dhis2_id !== null;
  const [members, setMembers] = createSignal<string[]>(
    existing?.definition.type === "sum" ? existing.definition.members : [],
  );
  const [expression, setExpression] = createSignal(
    existing?.definition.type === "derived"
      ? existing.definition.expression
      : "",
  );
  const [includeInAnalysis, setIncludeInAnalysis] = createSignal(
    existing?.include_in_analysis ?? true,
  );
  const [formatAs, setFormatAs] = createSignal(existing?.format_as ?? "number");
  const [thresholds, setThresholds] = createSignal<ThresholdsRule | null>(
    existing?.thresholds ?? null,
  );
  // A base or sum is a count: its format is always a number.
  const effectiveFormatAs = (): IndicatorFormat =>
    type() === "derived" ? formatAs() : "number";

  const ownId = () => indicatorId().trim() || "__new__";
  const isSpecial = () => isSpecialIndicatorId(indicatorId().trim());

  function currentDefinition(): CommonIndicatorDefinition {
    switch (type()) {
      case "derived":
        return { type: "derived", expression: expression().trim() };
      case "sum":
        return { type: "sum", members: members() };
      case "base":
        return { type: "base", dhis2_id: dhis2Id().trim() || null };
    }
  }

  // The other indicators a formula or a member list may name: never the one
  // being edited.
  const otherIndicators = createMemo(() =>
    p.indicators.filter((c) => c.indicator_common_id !== ownId()),
  );

  const memberOptions = createMemo(() =>
    otherIndicators()
      .filter((c) => c.definition.type === "base")
      .map((c) => ({
        value: c.indicator_common_id,
        label: `${c.indicator_common_label} (${c.indicator_common_id})`,
      })),
  );

  // Every DHIS2 id another indicator carries: one indicator carries one id,
  // so typing one of these is refused here before the server does.
  const dhis2IdOwners = createMemo(() => {
    const owners = new Map<string, string>();
    for (const c of otherIndicators()) {
      if (c.definition.type === "base" && c.definition.dhis2_id !== null) {
        owners.set(c.definition.dhis2_id, c.indicator_common_id);
      }
    }
    return owners;
  });

  // The same judgement capture makes, over the formula as typed: the editor
  // states it where the user is, capture enforces it where the data is.
  // Ingredients must resolve to indicators or population types, chains may
  // not cycle, and the flattened set must fit the ingredient slots a results
  // row carries: those refuse the save. A flattened ingredient with no data
  // is only a warning here, since data can come later.
  const judgement = createMemo<DerivedIndicatorComputability | undefined>(
    () => {
      const formula = expression().trim();
      if (type() !== "derived" || formula === "") return undefined;
      const dictionary = buildCommonIndicatorDictionary(
        [
          ...otherIndicators(),
          {
            indicator_common_id: ownId(),
            definition: { type: "derived", expression: formula },
          },
        ],
        POPULATION_TYPE_IDS,
      );
      return judgeDerivedIndicator(
        ownId(),
        formula,
        dictionary,
        p.idsWithData ?? new Set(p.indicators.map((c) => c.indicator_common_id)),
      );
    },
  );

  const expressionError = createMemo<string | undefined>(() => {
    if (type() !== "derived") return undefined;
    if (expression().trim() === "") {
      return t3({
        en: "A formula is required",
        fr: "Une formule est requise",
        pt: "É necessária uma fórmula",
      });
    }
    const j = judgement();
    return j?.kind === "unresolvable" ? j.problem : undefined;
  });

  const computabilityWarning = createMemo<string | undefined>(() => {
    const j = judgement();
    if (j?.kind !== "unmapped_ingredients") return undefined;
    return `${computabilityProblemText(j)}. ${t3({
      en: "You can still save; results cannot be generated until this is fixed.",
      fr: "Vous pouvez quand même enregistrer ; les résultats ne pourront pas être générés tant que ce problème n'est pas corrigé.",
      pt: "Pode guardar na mesma; os resultados não podem ser gerados até que isto seja corrigido.",
    })}`;
  });

  // Ruling 3: a checked derived indicator reaches every indicator its
  // formula flattens to, checked or not. Said here, once; the save goes.
  const unanalysedReached = createMemo<string[]>(() => {
    const j = judgement();
    if (!includeInAnalysis() || j === undefined || j.kind === "unresolvable") {
      return [];
    }
    const byId = new Map(p.indicators.map((c) => [c.indicator_common_id, c]));
    return j.resolved.ingredientIds.filter((id) => {
      const c = byId.get(id);
      return c !== undefined && !c.include_in_analysis && !isSpecialIndicatorId(id);
    });
  });

  const unanalysedNotice = createMemo<string | undefined>(() => {
    const ids = unanalysedReached();
    if (ids.length === 0) return undefined;
    const list = ids.join(", ");
    return ids.length === 1
      ? t3({
        en: `${list} is not included in analysis, but this formula uses it, so generation includes it anyway.`,
        fr: `${list} n'est pas inclus dans l'analyse, mais cette formule l'utilise : la génération l'inclut donc quand même.`,
        pt: `${list} não está incluído na análise, mas esta fórmula utiliza-o, pelo que a geração o inclui de qualquer forma.`,
      })
      : t3({
        en: `${list} are not included in analysis, but this formula uses them, so generation includes them anyway.`,
        fr: `${list} ne sont pas inclus dans l'analyse, mais cette formule les utilise : la génération les inclut donc quand même.`,
        pt: `${list} não estão incluídos na análise, mas esta fórmula utiliza-os, pelo que a geração os inclui de qualquer forma.`,
      });
  });

  // Every identifier the formula names, with what it resolves to. Empty while
  // the formula does not parse (the error above says why).
  const legend = createMemo<LegendRow[]>(() => {
    const formula = expression().trim();
    if (type() !== "derived" || formula === "") return [];
    let ids: string[];
    try {
      ids = collectIdentifiers(parseIndicatorExpression(formula));
    } catch {
      return [];
    }
    return ids.map((id) => {
      if (isPopulationTypeId(id)) {
        return {
          identifier: writeIdentifier(id),
          kind: "population",
          label: t3(populationTypeLabel(id)),
          coverage: populationCoverageSummary(
            id,
            instanceState.populationCoverage,
          ),
        };
      }
      return {
        identifier: writeIdentifier(id),
        kind: "indicator",
        label: otherIndicators().find((c) => c.indicator_common_id === id)
          ?.indicator_common_label,
      };
    });
  });

  const legendNamesPopulation = createMemo(() =>
    legend().some((row) => row.kind === "population"),
  );

  // Inserts at the formula input's caret (appends when the input has never
  // been focused), padded so the identifier never fuses with its neighbours.
  function insertIdentifier(id: string) {
    const el = formulaHolder?.querySelector("textarea") ?? null;
    const current = expression();
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const text =
      (before === "" || /[\s(]$/.test(before) ? "" : " ") +
      writeIdentifier(id) +
      (after === "" || /^[\s)]/.test(after) ? "" : " ");
    setExpression(before + text + after);
    if (el) {
      el.focus();
      const caret = before.length + text.length;
      el.setSelectionRange(caret, caret);
    }
  }

  function definitionError(): string | undefined {
    if (type() === "base") {
      const id = dhis2Id().trim();
      if (id === "") return undefined;
      if (!isDhis2ShapedId(id)) {
        return t3({
          en: `DHIS2 id "${id}" must be a data element UID (11 characters) or a UID.COC operand`,
          fr: `L'identifiant DHIS2 « ${id} » doit être un UID d'élément de données (11 caractères) ou un opérande UID.COC`,
          pt: `O ID DHIS2 "${id}" tem de ser um UID de elemento de dados (11 caracteres) ou um operando UID.COC`,
        });
      }
      const owner = dhis2IdOwners().get(id);
      if (owner !== undefined) {
        return t3({
          en: `DHIS2 id "${id}" already belongs to ${owner}. One indicator carries one DHIS2 id; make a sum or a derived indicator over ${owner} instead.`,
          fr: `L'identifiant DHIS2 « ${id} » appartient déjà à ${owner}. Un indicateur porte un seul identifiant DHIS2 ; créez plutôt une somme ou un indicateur dérivé sur ${owner}.`,
          pt: `O ID DHIS2 "${id}" já pertence a ${owner}. Um indicador tem um único ID DHIS2; crie antes uma soma ou um indicador derivado sobre ${owner}.`,
        });
      }
      return undefined;
    }
    if (type() === "sum") {
      return members().length === 0
        ? t3({
          en: "A sum needs at least one member",
          fr: "Une somme nécessite au moins un membre",
          pt: "Uma soma precisa de pelo menos um membro",
        })
        : undefined;
    }
    return expressionError();
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const id = indicatorId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !id) {
        return {
          success: false,
          err: t3({
            en: "Indicator ID is required",
            fr: "L'identifiant de l'indicateur est requis",
            pt: "O ID do indicador é obrigatório",
          }),
        };
      }

      const idIssue = mode === "create"
        ? getNewIndicatorIdIssue(id, type())
        : getSpecialIndicatorTypeIssue(id, type());
      if (idIssue === "reserved") {
        return {
          success: false,
          err: t3({
            en: `"${id}" is a reserved word and cannot be an indicator ID (reserved: ${RESERVED_WORDS.join(", ")})`,
            fr: `« ${id} » est un mot réservé et ne peut pas être un identifiant d'indicateur (réservés : ${RESERVED_WORDS.join(", ")})`,
            pt: `"${id}" é uma palavra reservada e não pode ser um ID de indicador (reservadas: ${RESERVED_WORDS.join(", ")})`,
          }),
        };
      }
      if (idIssue === "special_not_base") {
        return {
          success: false,
          err: t3({
            en: `"${id}" is a special indicator ID, which the analysis modules read as a count, so it can only be a base or sum indicator (special: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            fr: `« ${id} » est un identifiant d'indicateur spécial, lu comme un dénombrement par les modules d'analyse, et ne peut donc être qu'un indicateur de base ou une somme (spéciaux : ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            pt: `"${id}" é um ID de indicador especial, lido como uma contagem pelos módulos de análise, pelo que só pode ser um indicador de base ou uma soma (especiais: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
          }),
        };
      }
      if (idIssue !== undefined) {
        return {
          success: false,
          err: t3({
            en: "Indicator ID must not contain commas, semicolons, colons, or square brackets, and must be at most 128 characters",
            fr: "L'identifiant de l'indicateur ne doit pas contenir de virgules, de points-virgules, de deux-points ou de crochets, et doit comporter au maximum 128 caractères",
            pt: "O ID do indicador não pode conter vírgulas, pontos e vírgulas, dois pontos ou parênteses retos, e deve ter no máximo 128 caracteres",
          }),
        };
      }

      if (!label) {
        return {
          success: false,
          err: t3({
            en: "Indicator label is required",
            fr: "Le libellé de l'indicateur est requis",
            pt: "A etiqueta do indicador é obrigatória",
          }),
        };
      }

      const defErr = definitionError();
      if (defErr) {
        return { success: false, err: defErr };
      }

      const rule = thresholds();
      if (rule && !thresholdsRuleSchema.safeParse(rule).success) {
        return {
          success: false,
          err: t3({
            en: "Thresholds must be ascending numbers",
            fr: "Les seuils doivent être des nombres croissants",
            pt: "Os limiares devem ser números crescentes",
          }),
        };
      }

      const indicator = {
        indicator_common_id: id,
        indicator_common_label: label,
        definition: currentDefinition(),
        include_in_analysis: includeInAnalysis(),
        format_as: effectiveFormatAs(),
        thresholds: rule,
      };

      if (mode === "create") {
        return await serverActions.createIndicators({
          indicators: [indicator],
        });
      }
      return await serverActions.updateIndicator({
        old_indicator_common_id: existing!.indicator_common_id,
        indicator,
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="indicator-form"
      header={
        mode === "create"
          ? t3({
              en: "Add indicator",
              fr: "Ajouter un indicateur",
              pt: "Adicionar indicador",
            })
          : t3({
              en: "Update indicator",
              fr: "Mettre à jour l'indicateur",
              pt: "Atualizar indicador",
            })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      width="xl"
    >
      <div class="ui-gap grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        <Input
          label={t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" })}
          value={indicatorId()}
          onChange={setIndicatorId}
          fullWidth
          autoFocus={mode === "create"}
          mono
          disabled={mode === "update"}
        />
        <Input
          label={t3(TC.label)}
          value={indicatorLabel()}
          onChange={setIndicatorLabel}
          fullWidth
        />
      </div>
      <Select
        label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
        value={type()}
        onChange={(v) => setType(v as CommonIndicatorType)}
        options={TYPE_OPTIONS}
        fullWidth
      />

      <div class="ui-gap grid grid-cols-[repeat(auto-fit,minmax(24rem,1fr))] items-start">
        <div class="ui-spy-sm">
          <div class="font-700 text-base-content text-sm">
            {t3({ en: "Definition", fr: "Définition", pt: "Definição" })}
          </div>

          <Show when={type() === "base"}>
            <Input
              label={t3({ en: "DHIS2 id", fr: "Identifiant DHIS2", pt: "ID DHIS2" })}
              value={dhis2Id()}
              onChange={setDhis2Id}
              placeholder={t3({
                en: "Empty for an uploaded indicator",
                fr: "Vide pour un indicateur téléversé",
                pt: "Vazio para um indicador carregado",
              })}
              disabled={dhis2IdLocked}
              mono
              fullWidth
            />
            <div class="ui-text-caption text-xs">
              {dhis2IdLocked
                ? t3({
                  en: "The DHIS2 data element or operand this indicator is fetched from. It cannot change once set.",
                  fr: "L'élément de données ou l'opérande DHIS2 dont cet indicateur est récupéré. Il ne peut plus changer une fois défini.",
                  pt: "O elemento de dados ou operando DHIS2 de onde este indicador é obtido. Não pode mudar depois de definido.",
                })
                : t3({
                  en: "The DHIS2 data element UID or UID.COC operand the import fetches into this indicator. Leave it empty for an indicator filled by CSV upload, where the file's indicator id is this indicator's own id.",
                  fr: "L'UID d'élément de données ou l'opérande UID.COC que l'importation récupère dans cet indicateur. Laissez vide pour un indicateur rempli par téléversement CSV, où l'identifiant d'indicateur du fichier est l'identifiant de cet indicateur.",
                  pt: "O UID de elemento de dados ou o operando UID.COC que a importação obtém para este indicador. Deixe vazio para um indicador preenchido por carregamento CSV, em que o ID de indicador do ficheiro é o ID deste indicador.",
                })}
            </div>
          </Show>

          <Show when={type() === "sum"}>
            <MultiSelectSearch
              label={t3({ en: "Members", fr: "Membres", pt: "Membros" })}
              options={memberOptions()}
              values={members()}
              onChange={setMembers}
              placeholder={t3({
                en: "Search base indicators...",
                fr: "Rechercher des indicateurs de base...",
                pt: "Pesquisar indicadores de base...",
              })}
              fullWidth
            />
            <div class="ui-text-caption text-xs">
              {t3({
                en: "The members' counts are added per facility and month. Members are base indicators; a sum cannot contain a sum.",
                fr: "Les dénombrements des membres sont additionnés par établissement et par mois. Les membres sont des indicateurs de base ; une somme ne peut pas contenir une somme.",
                pt: "As contagens dos membros são somadas por estabelecimento e mês. Os membros são indicadores de base; uma soma não pode conter uma soma.",
              })}
            </div>
          </Show>

          <Show when={type() === "derived"}>
            <div ref={formulaHolder}>
              <TextArea
                label={t3({ en: "Formula", fr: "Formule", pt: "Fórmula" })}
                value={expression()}
                onChange={setExpression}
                rows={3}
                fullWidth
                mono
              />
            </div>
            <div class="ui-text-caption text-xs">
              {t3({
                en: "Use + - * / and parentheses over other indicators and populations, e.g. anc4 / anc1 or anc4 / population_pregnancies. abs(), coalesce() and nullif() are available.",
                fr: "Utilisez + - * / et des parenthèses sur d'autres indicateurs et des populations, par ex. anc4 / anc1 ou anc4 / population_pregnancies. abs(), coalesce() et nullif() sont disponibles.",
                pt: "Utilize + - * / e parênteses sobre outros indicadores e populações, por ex. anc4 / anc1 ou anc4 / population_pregnancies. abs(), coalesce() e nullif() estão disponíveis.",
              })}
            </div>
            <Show when={expressionError()}>
              {(err) => <div class="text-danger text-xs">{err()}</div>}
            </Show>
            <Show when={computabilityWarning()}>
              {(warning) => (
                <div class="text-warning text-xs">{warning()}</div>
              )}
            </Show>
            <Show when={unanalysedNotice()}>
              {(notice) => (
                <div class="text-warning text-xs">{notice()}</div>
              )}
            </Show>
            <div class="ui-gap-sm flex items-end">
              <SelectSearch
                label={t3({
                  en: "Insert indicator",
                  fr: "Insérer un indicateur",
                  pt: "Inserir indicador",
                })}
                value={undefined}
                onChange={insertIdentifier}
                placeholder={t3({
                  en: "Search indicators...",
                  fr: "Rechercher des indicateurs...",
                  pt: "Pesquisar indicadores...",
                })}
                options={otherIndicators().map((c) => ({
                  value: c.indicator_common_id,
                  label: `${c.indicator_common_label} (${c.indicator_common_id})`,
                }))}
                fullWidth
              />
              <SelectSearch
                label={t3({
                  en: "Insert population",
                  fr: "Insérer une population",
                  pt: "Inserir população",
                })}
                value={undefined}
                onChange={insertIdentifier}
                placeholder={t3({
                  en: "Search populations...",
                  fr: "Rechercher des populations...",
                  pt: "Pesquisar populações...",
                })}
                options={POPULATION_TYPE_IDS.map((pt) => ({
                  value: pt,
                  label: `${t3(populationTypeLabel(pt))} (${pt})${
                    populationCoverageSummary(
                      pt,
                      instanceState.populationCoverage,
                    ).empty
                      ? ` — ${t3({
                          en: "no data",
                          fr: "aucune donnée",
                          pt: "sem dados",
                        })}`
                      : ""
                  }`,
                }))}
                fullWidth
              />
            </div>
            <Show when={legend().length > 0}>
              <LabelHolder
                label={t3({
                  en: "Included indicators",
                  fr: "Indicateurs inclus",
                  pt: "Indicadores incluídos",
                })}
              >
                <div class="ui-spy-sm ui-pad-sm rounded border">
                  <For each={legend()}>
                    {(row) => (
                      <div class="ui-gap-sm flex items-baseline text-xs">
                        <span class="font-mono">{row.identifier}</span>
                        <span class="text-base-content-muted">
                          {row.kind === "population"
                            ? t3({
                                en: "population",
                                fr: "population",
                                pt: "população",
                              })
                            : t3({
                                en: "indicator",
                                fr: "indicateur",
                                pt: "indicador",
                              })}
                        </span>
                        <Show
                          when={row.label}
                          fallback={
                            <span class="text-danger">
                              {t3({
                                en: "not found",
                                fr: "introuvable",
                                pt: "não encontrado",
                              })}
                            </span>
                          }
                        >
                          {(label) => <span>{label()}</span>}
                        </Show>
                        <Show when={row.coverage}>
                          {(coverage) => (
                            <span
                              class={
                                coverage().empty
                                  ? "text-danger"
                                  : "text-base-content-muted"
                              }
                            >
                              {coverage().text}
                            </span>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={legendNamesPopulation()}>
                    <div class="ui-text-caption text-xs">
                      {t3({
                        en: "A population term is person-years (annual population × months / 12), so a value divided by it is annualised: a monthly or quarterly value reads as a rate per year. Population figures come from the instance Population page.",
                        fr: "Un terme de population représente des personnes-années (population annuelle × mois / 12) : une valeur divisée par ce terme est donc annualisée, et une valeur mensuelle ou trimestrielle se lit comme un taux annuel. Les chiffres de population proviennent de la page Population de l'instance.",
                        pt: "Um termo de população são pessoas-ano (população anual × meses / 12), pelo que um valor dividido por ele é anualizado: um valor mensal ou trimestral lê-se como uma taxa anual. Os valores de população provêm da página População da instância.",
                      })}
                    </div>
                  </Show>
                </div>
              </LabelHolder>
            </Show>
          </Show>
        </div>

        <div class="ui-spy-sm">
          <div class="font-700 text-base-content text-sm">
            {t3({ en: "Analysis and display", fr: "Analyse et affichage", pt: "Análise e apresentação" })}
          </div>
          <Checkbox
            label={t3({
              en: "Include in analysis",
              fr: "Inclure dans l'analyse",
              pt: "Incluir na análise",
            })}
            checked={includeInAnalysis()}
            onChange={setIncludeInAnalysis}
          />
          <div class="ui-text-caption text-xs">
            {isSpecial()
              ? t3({
                en: "A special indicator is always analysed: the analysis modules read it by name.",
                fr: "Un indicateur spécial est toujours analysé : les modules d'analyse le lisent par son identifiant.",
                pt: "Um indicador especial é sempre analisado: os módulos de análise leem-no pelo ID.",
              })
              : t3({
                en: "On: every results package analyses this indicator. Off: dictionary only; its data is still imported and stored, and it can still be a member of a sum or used in a formula.",
                fr: "Coché : chaque paquet de résultats analyse cet indicateur. Décoché : dictionnaire seulement ; ses données sont toujours importées et conservées, et il peut toujours être membre d'une somme ou utilisé dans une formule.",
                pt: "Marcado: todos os pacotes de resultados analisam este indicador. Desmarcado: apenas dicionário; os seus dados continuam a ser importados e guardados, e pode continuar a ser membro de uma soma ou usado numa fórmula.",
              })}
          </div>
          <Select
            label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
            value={effectiveFormatAs()}
            onChange={setFormatAs}
            options={FORMAT_OPTIONS}
            disabled={type() !== "derived"}
            fullWidth
          />
          <Select
            label={t3({
              en: "Conditional formatting rule",
              fr: "Règle de mise en forme conditionnelle",
              pt: "Regra de formatação condicional",
            })}
            value={thresholds() ? "on" : "off"}
            onChange={(v) =>
              setThresholds(
                v === "on"
                  ? (thresholds() ?? defaultIndicatorRule(effectiveFormatAs()))
                  : null,
              )
            }
            options={[
              {
                value: "off",
                label: t3({ en: "None", fr: "Aucune", pt: "Nenhuma" }),
              },
              {
                value: "on",
                label: t3({ en: "Set", fr: "Définie", pt: "Definida" }),
              },
            ]}
            fullWidth
          />
          <Show when={thresholds()}>
            {(rule) => (
              <ThresholdsPanel
                cf={rule()}
                onChange={setThresholds}
                formatAs={effectiveFormatAs()}
                decimalPlaces={0}
                showLabels={true}
                showPresets={false}
              />
            )}
          </Show>
        </div>
      </div>
    </AlertFormHolder>
  );
}
