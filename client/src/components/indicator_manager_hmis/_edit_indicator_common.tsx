// Create/update one common indicator. The form branches on what the indicator
// IS (PLAN_1a §1.2, PLAN_1c): a base indicator is defined by its raw mappings
// and is always a number; a derived one by a formula over other commons and
// population terms, with a free display format. The palette below the
// formula inserts correctly written identifiers, and the legend names every
// identifier the formula references.
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  createFormAction,
  getUnique,
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
  baseIdsWithMappings,
  buildCommonIndicatorDictionary,
  collectIdentifiers,
  type CommonIndicatorDefinition,
  type CommonIndicatorType,
  type CommonIndicatorWithMappings,
  type DerivedIndicatorComputability,
  getLanguage,
  getNewIndicatorIdIssue,
  RESERVED_INDICATOR_IDS,
  type IndicatorFormat,
  judgeDerivedIndicator,
  parseIndicatorExpression,
  isPopulationTypeId,
  POPULATION_TYPE_IDS,
  populationTypeLabel,
  type RawIndicatorWithMappings,
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
      en: "Base — summed from mapped raw indicators",
      fr: "De base — somme des indicateurs bruts associés",
      pt: "Base — soma dos indicadores brutos associados",
    }),
  },
  {
    value: "derived",
    label: t3({
      en: "Derived — a formula over other indicators and populations",
      fr: "Dérivé — une formule sur d'autres indicateurs et des populations",
      pt: "Derivado — uma fórmula sobre outros indicadores e populações",
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

export function EditIndicatorCommonForm(
  p: AlertComponentProps<
    {
      rawIndicators: RawIndicatorWithMappings[];
      commonIndicators: CommonIndicatorWithMappings[];
      existingCommonIndicator?: CommonIndicatorWithMappings;
    },
    undefined
  >,
) {
  const mode = p.existingCommonIndicator ? "update" : "create";
  const existing = p.existingCommonIndicator;
  let formulaHolder: HTMLDivElement | undefined;

  const [indicatorCommonId, setIndicatorCommonId] = createSignal(
    existing?.indicator_common_id || "",
  );
  const [indicatorLabel, setIndicatorLabel] = createSignal(
    existing?.indicator_common_label || "",
  );
  const [type, setType] = createSignal<CommonIndicatorType>(
    existing?.definition.type ?? "base",
  );
  const [mappedRawIds, setMappedRawIds] = createSignal<string[]>(
    existing?.raw_indicator_ids ?? [],
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

  const ownId = () => indicatorCommonId().trim() || "__new__";

  function currentDefinition(): CommonIndicatorDefinition {
    if (type() === "derived") {
      return { type: "derived", expression: expression().trim() };
    }
    return { type: "base" };
  }

  // The other commons a formula may name: never the indicator being edited.
  const otherCommons = createMemo(() =>
    p.commonIndicators.filter((c) => c.indicator_common_id !== ownId()),
  );

  // The same judgement capture makes, over the formula as typed: the editor
  // states it where the user is, capture enforces it where the data is.
  // Ingredients must resolve to commons or population types, chains may not
  // cycle, and the flattened set must fit the ingredient slots a results row
  // carries: those refuse the save. A flattened ingredient with no mapped
  // raw indicator is only a warning here, since mapping comes later.
  const judgement = createMemo<DerivedIndicatorComputability | undefined>(
    () => {
      const source = expression().trim();
      if (type() === "base" || source === "") return undefined;
      const dictionary = buildCommonIndicatorDictionary(
        [
          ...otherCommons(),
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
        baseIdsWithMappings(p.commonIndicators),
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
        label: otherCommons().find((c) => c.indicator_common_id === id)
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

  function addMappedRawId() {
    setMappedRawIds([...mappedRawIds(), ""]);
  }

  function removeMappedRawId(index: number) {
    setMappedRawIds(mappedRawIds().filter((_, i) => i !== index));
  }

  function updateMappedRawId(index: number, value: string) {
    const updated = [...mappedRawIds()];
    updated[index] = value;
    setMappedRawIds(updated);
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const commonId = indicatorCommonId().trim();
      const label = indicatorLabel().trim();

      if (mode === "create" && !commonId) {
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
        ? getNewIndicatorIdIssue(commonId, "common")
        : undefined;
      if (idIssue === "reserved") {
        return {
          success: false,
          err: t3({
            en: `"${commonId}" is a reserved word and cannot be an indicator ID (reserved: ${RESERVED_INDICATOR_IDS.join(", ")})`,
            fr: `« ${commonId} » est un mot réservé et ne peut pas être un identifiant d'indicateur (réservés : ${RESERVED_INDICATOR_IDS.join(", ")})`,
            pt: `"${commonId}" é uma palavra reservada e não pode ser um ID de indicador (reservadas: ${RESERVED_INDICATOR_IDS.join(", ")})`,
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
        indicator_common_id: commonId,
        indicator_common_label: label,
        mapped_raw_ids:
          type() === "base"
            ? getUnique(mappedRawIds().filter((id) => id.trim() !== ""))
            : [],
        definition: currentDefinition(),
        format_as: effectiveFormatAs(),
        thresholds: rule,
      };

      if (mode === "create") {
        return await serverActions.createCommonIndicators({
          indicators: [indicator],
        });
      }
      return await serverActions.updateCommonIndicator({
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
              en: "Add Common Indicator",
              fr: "Ajouter un indicateur commun",
              pt: "Adicionar indicador comum",
            })
          : t3({
              en: "Update Common Indicator",
              fr: "Mettre à jour l'indicateur commun",
              pt: "Atualizar indicador comum",
            })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      width="xl"
    >
      <div class="ui-gap grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
        <Input
          label={t3({ en: "Common ID", fr: "ID commun", pt: "ID comum" })}
          value={indicatorCommonId()}
          onChange={setIndicatorCommonId}
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
                  en: "Mapped DHIS2 Indicators (JSON IDs)",
                  fr: "Indicateurs DHIS2 associés (ID JSON)",
                  pt: "Indicadores DHIS2 associados (ID JSON)",
                })}
              </div>
              <For each={mappedRawIds()}>
                {(rawId, index) => (
                  <div class="ui-gap-sm flex items-center">
                    <SelectSearch
                      value={rawId || undefined}
                      onChange={(value) => updateMappedRawId(index(), value)}
                      placeholder={t3({
                        en: "Select DHIS2 indicator...",
                        fr: "Sélectionner un indicateur DHIS2...",
                        pt: "Selecionar um indicador DHIS2...",
                      })}
                      options={p.rawIndicators.map((raw) => ({
                        value: raw.raw_indicator_id,
                        label: `${raw.raw_indicator_id} ~ ${raw.raw_indicator_label}`,
                      }))}
                      fullWidth
                    />
                    <Button
                      intent="danger"
                      onClick={(e) => {
                        e.preventDefault();
                        removeMappedRawId(index());
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
                    addMappedRawId();
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
                options={otherCommons().map((c) => ({
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
