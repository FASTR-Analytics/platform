// Create/update one indicator. The form branches on what the indicator IS
// (PLAN_1a §1.2, PLAN_1c, PLAN_A3 §2): a base indicator is defined by its
// sources, written in the same transaction, and is always a number; a
// derived one by a formula over other indicators and population terms, with
// a free display format. The palette below the formula inserts correctly
// written identifiers, and the legend names every identifier the formula
// references.
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  createFormAction,
  Input,
  LabelHolder,
  Select,
  SelectSearch,
  TextArea,
} from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
  baseIdsWithSources,
  buildCommonIndicatorDictionary,
  collectIdentifiers,
  type CommonIndicatorDefinition,
  type CommonIndicatorType,
  type DerivedIndicatorComputability,
  getLanguage,
  getNewIndicatorIdIssue,
  getNewSourceIdIssue,
  getSpecialIndicatorTypeIssue,
  type IndicatorFormat,
  type IndicatorSource,
  type IndicatorWithSources,
  isPopulationTypeId,
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
      en: "Base: the sum of its sources",
      fr: "De base : la somme de ses sources",
      pt: "Base: a soma das suas fontes",
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
      indicators: IndicatorWithSources[];
      existingIndicator?: IndicatorWithSources;
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
  const [sources, setSources] = createSignal<IndicatorSource[]>(
    existing?.sources.map((s) => ({ ...s })) ?? [],
  );
  const [expression, setExpression] = createSignal(
    existing?.definition.type === "derived"
      ? existing.definition.expression
      : "",
  );
  const [formatAs, setFormatAs] = createSignal(existing?.format_as ?? "number");
  const [thresholds, setThresholds] = createSignal<ThresholdsRule | null>(
    existing?.thresholds ?? null,
  );
  // A base indicator is a count: its format is always a number.
  const effectiveFormatAs = (): IndicatorFormat =>
    type() === "base" ? "number" : formatAs();

  const ownId = () => indicatorId().trim() || "__new__";

  function currentDefinition(): CommonIndicatorDefinition {
    if (type() === "derived") {
      return { type: "derived", expression: expression().trim() };
    }
    return { type: "base" };
  }

  // The other indicators a formula may name: never the one being edited.
  const otherIndicators = createMemo(() =>
    p.indicators.filter((c) => c.indicator_common_id !== ownId()),
  );

  // Every source that belongs to another indicator: a source belongs to
  // exactly one base, so typing one of these is refused here before the
  // server does.
  const sourceOwners = createMemo(() => {
    const owners = new Map<string, string>();
    for (const c of otherIndicators()) {
      for (const s of c.sources) owners.set(s.source_id, c.indicator_common_id);
    }
    return owners;
  });

  // The same judgement capture makes, over the formula as typed: the editor
  // states it where the user is, capture enforces it where the data is.
  // Ingredients must resolve to indicators or population types, chains may
  // not cycle, and the flattened set must fit the ingredient slots a results
  // row carries: those refuse the save. A flattened ingredient with no
  // sources is only a warning here, since sources can come later.
  const judgement = createMemo<DerivedIndicatorComputability | undefined>(
    () => {
      const source = expression().trim();
      if (type() === "base" || source === "") return undefined;
      const dictionary = buildCommonIndicatorDictionary(
        [
          ...otherIndicators(),
          {
            indicator_common_id: ownId(),
            definition: { type: "derived", expression: source },
          },
        ],
        POPULATION_TYPE_IDS,
      );
      return judgeDerivedIndicator(
        ownId(),
        source,
        dictionary,
        baseIdsWithSources(p.indicators),
      );
    },
  );

  const expressionError = createMemo<string | undefined>(() => {
    if (type() === "base") return undefined;
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

  // Every identifier the formula names, with what it resolves to. Empty while
  // the formula does not parse (the error above says why).
  const legend = createMemo<LegendRow[]>(() => {
    const source = expression().trim();
    if (type() === "base" || source === "") return [];
    let ids: string[];
    try {
      ids = collectIdentifiers(parseIndicatorExpression(source));
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

  function addSource() {
    setSources([...sources(), { source_id: "", source_label: "" }]);
  }

  function removeSource(index: number) {
    setSources(sources().filter((_, i) => i !== index));
  }

  function updateSource(index: number, patch: Partial<IndicatorSource>) {
    setSources(sources().map((s, i) => (i === index ? { ...s, ...patch } : s)));
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
            en: `"${id}" is a special indicator ID, which the analysis modules read as a count, so it can only be a base indicator (special: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            fr: `« ${id} » est un identifiant d'indicateur spécial, lu comme un dénombrement par les modules d'analyse, et ne peut donc être qu'un indicateur de base (spéciaux : ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            pt: `"${id}" é um ID de indicador especial, lido como uma contagem pelos módulos de análise, pelo que só pode ser um indicador de base (especiais: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
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

      const exprErr = expressionError();
      if (exprErr) {
        return { success: false, err: exprErr };
      }

      const cleanSources: IndicatorSource[] = type() === "base"
        ? sources()
          .map((s) => ({
            source_id: s.source_id.trim(),
            source_label: s.source_label.trim() || s.source_id.trim(),
          }))
          .filter((s) => s.source_id !== "")
        : [];
      const seen = new Set<string>();
      for (const s of cleanSources) {
        if (getNewSourceIdIssue(s.source_id)) {
          return {
            success: false,
            err: t3({
              en: `Source ID "${s.source_id}" must not contain commas, semicolons, colons, or square brackets, and must be at most 128 characters`,
              fr: `L'identifiant de source « ${s.source_id} » ne doit pas contenir de virgules, de points-virgules, de deux-points ou de crochets, et doit comporter au maximum 128 caractères`,
              pt: `O ID de fonte "${s.source_id}" não pode conter vírgulas, pontos e vírgulas, dois pontos ou parênteses retos, e deve ter no máximo 128 caracteres`,
            }),
          };
        }
        if (seen.has(s.source_id)) {
          return {
            success: false,
            err: t3({
              en: `Source "${s.source_id}" is listed twice`,
              fr: `La source « ${s.source_id} » apparaît deux fois`,
              pt: `A fonte "${s.source_id}" aparece duas vezes`,
            }),
          };
        }
        seen.add(s.source_id);
        const owner = sourceOwners().get(s.source_id);
        if (owner !== undefined) {
          return {
            success: false,
            err: t3({
              en: `Source "${s.source_id}" already belongs to ${owner}. A source belongs to exactly one base indicator; define a derived indicator over ${owner} instead.`,
              fr: `La source « ${s.source_id} » appartient déjà à ${owner}. Une source appartient à un seul indicateur de base ; définissez plutôt un indicateur dérivé sur ${owner}.`,
              pt: `A fonte "${s.source_id}" já pertence a ${owner}. Uma fonte pertence a exatamente um indicador de base; defina antes um indicador derivado sobre ${owner}.`,
            }),
          };
        }
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
        sources: cleanSources,
        definition: currentDefinition(),
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
            <div class="ui-spy-sm">
              <div class="ui-text-caption text-xs">
                {t3({
                  en: "Sources: the DHIS2 data element or operand ids, or the CSV indicator ids, whose values are summed",
                  fr: "Sources : les identifiants d'éléments de données ou d'opérandes DHIS2, ou les identifiants d'indicateurs CSV, dont les valeurs sont additionnées",
                  pt: "Fontes: os IDs de elementos de dados ou operandos DHIS2, ou os IDs de indicadores CSV, cujos valores são somados",
                })}
              </div>
              <For each={sources()}>
                {(source, index) => (
                  <div class="ui-gap-sm flex items-center">
                    <Input
                      value={source.source_id}
                      onChange={(v) => updateSource(index(), { source_id: v })}
                      placeholder={t3({ en: "Source ID", fr: "ID de la source", pt: "ID da fonte" })}
                      mono
                      fullWidth
                    />
                    <Input
                      value={source.source_label}
                      onChange={(v) => updateSource(index(), { source_label: v })}
                      placeholder={t3(TC.label)}
                      fullWidth
                    />
                    <Button
                      intent="danger"
                      onClick={(e) => {
                        e.preventDefault();
                        removeSource(index());
                      }}
                      iconName="trash"
                      outline
                    />
                  </div>
                )}
              </For>
              <div class="">
                <Button
                  intent="success"
                  onClick={(e) => {
                    e.preventDefault();
                    addSource();
                  }}
                  iconName="plus"
                  outline
                />
              </div>
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
            {t3({ en: "Display", fr: "Affichage", pt: "Apresentação" })}
          </div>
          <Select
            label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
            value={effectiveFormatAs()}
            onChange={setFormatAs}
            options={FORMAT_OPTIONS}
            disabled={type() === "base"}
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
