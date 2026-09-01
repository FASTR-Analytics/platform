// Create/update one common indicator. The form branches on what the indicator
// IS (PLAN_1a §1.2): a base indicator is defined by its raw mappings, a
// derived one by an expression over other commons, and a population rate by a
// numerator expression plus the population term to divide by.
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Select,
  SelectSearch,
  getUnique,
  createFormAction,
} from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import {
  t3,
  TC,
  buildExpressionDictionary,
  type CommonIndicatorDefinition,
  type CommonIndicatorType,
  type CommonIndicatorWithMappings,
  getNewIndicatorIdIssue,
  IndicatorExpressionError,
  MAX_INDICATOR_EXPRESSION_INGREDIENTS,
  MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS,
  POPULATION_TYPES,
  type PopulationType,
  type RawIndicatorWithMappings,
  resolveIndicatorExpression,
} from "lib";
import { serverActions } from "~/server_actions";

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
      en: "Derived — a formula over other indicators",
      fr: "Dérivé — une formule sur d'autres indicateurs",
      pt: "Derivado — uma fórmula sobre outros indicadores",
    }),
  },
  {
    value: "population_rate",
    label: t3({
      en: "Population rate — a formula divided by population",
      fr: "Taux de population — une formule divisée par la population",
      pt: "Taxa populacional — uma fórmula dividida pela população",
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
      : existing?.definition.type === "population_rate"
      ? existing.definition.numeratorExpression
      : "",
  );
  const [populationType, setPopulationType] = createSignal<PopulationType>(
    existing?.definition.type === "population_rate"
      ? existing.definition.populationType
      : "total_population",
  );
  const [multiplier, setMultiplier] = createSignal(
    existing?.definition.type === "population_rate"
      ? String(existing.definition.multiplier)
      : "1",
  );
  const [formatAs, setFormatAs] = createSignal(
    existing?.format_as ?? "number",
  );
  const [groupLabel, setGroupLabel] = createSignal(existing?.group_label ?? "");
  const [thresholdsOn, setThresholdsOn] = createSignal(
    existing?.thresholds != null,
  );
  const [thresholdDirection, setThresholdDirection] = createSignal(
    existing?.thresholds?.direction ?? "higher_is_better",
  );
  const [thresholdGreen, setThresholdGreen] = createSignal(
    String(existing?.thresholds?.green ?? 0),
  );
  const [thresholdYellow, setThresholdYellow] = createSignal(
    String(existing?.thresholds?.yellow ?? 0),
  );

  function currentDefinition(): CommonIndicatorDefinition {
    if (type() === "derived") {
      return { type: "derived", expression: expression().trim() };
    }
    if (type() === "population_rate") {
      return {
        type: "population_rate",
        numeratorExpression: expression().trim(),
        populationType: populationType(),
        multiplier: Number(multiplier()),
      };
    }
    return { type: "base" };
  }

  // Live validation against the same rules the server enforces — the editor
  // states them where the user is, capture states them again where the data
  // is. Ingredients must resolve to base or derived commons, chains may not
  // cycle, and the flattened set must fit the ingredient slots a results row
  // carries; the message names the flattened set when it does not.
  const expressionError = createMemo<string | undefined>(() => {
    if (type() === "base") return undefined;
    const source = expression().trim();
    if (source === "") {
      return t3({
        en: "A formula is required",
        fr: "Une formule est requise",
        pt: "É necessária uma fórmula",
      });
    }
    const ownId = indicatorCommonId().trim() || "__new__";
    const entries = p.commonIndicators
      .filter((c) => c.indicator_common_id !== ownId)
      .map((c) => ({
        id: c.indicator_common_id,
        type: c.definition.type,
        expression: c.definition.type === "derived"
          ? c.definition.expression
          : c.definition.type === "population_rate"
          ? c.definition.numeratorExpression
          : null,
      }));
    const definition = currentDefinition();
    entries.push({
      id: ownId,
      type: definition.type,
      expression: definition.type === "derived"
        ? definition.expression
        : definition.type === "population_rate"
        ? definition.numeratorExpression
        : null,
    });
    try {
      resolveIndicatorExpression({
        ownId,
        source,
        dictionary: buildExpressionDictionary(entries),
        maxIngredients: type() === "population_rate"
          ? MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS
          : MAX_INDICATOR_EXPRESSION_INGREDIENTS,
      });
      return undefined;
    } catch (e) {
      return e instanceof IndicatorExpressionError
        ? e.message
        : String(e instanceof Error ? e.message : e);
    }
  });

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

      if (mode === "create" && getNewIndicatorIdIssue(commonId)) {
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

      // Number("") is 0, so an empty field must be rejected before parsing —
      // and a zero or negative multiplier makes every rate meaningless.
      if (type() === "population_rate") {
        const multiplierValue = Number(multiplier().trim());
        if (
          multiplier().trim() === "" ||
          !Number.isFinite(multiplierValue) ||
          multiplierValue <= 0
        ) {
          return {
            success: false,
            err: t3({
              en: "Multiplier must be a positive number",
              fr: "Le multiplicateur doit être un nombre positif",
              pt: "O multiplicador deve ser um número positivo",
            }),
          };
        }
      }

      if (thresholdsOn()) {
        const greenValue = thresholdGreen().trim();
        const yellowValue = thresholdYellow().trim();
        if (
          greenValue === "" || yellowValue === "" ||
          !Number.isFinite(Number(greenValue)) ||
          !Number.isFinite(Number(yellowValue))
        ) {
          return {
            success: false,
            err: t3({
              en: "Thresholds must be numbers",
              fr: "Les seuils doivent être des nombres",
              pt: "Os limiares devem ser números",
            }),
          };
        }
      }

      const indicator = {
        indicator_common_id: commonId,
        indicator_common_label: label,
        mapped_raw_ids: type() === "base"
          ? getUnique(mappedRawIds().filter((id) => id.trim() !== ""))
          : [],
        definition: currentDefinition(),
        format_as: formatAs() as "percent" | "number" | "rate_per_10k",
        thresholds: thresholdsOn()
          ? {
            direction: thresholdDirection() as
              | "higher_is_better"
              | "lower_is_better",
            green: Number(thresholdGreen()),
            yellow: Number(thresholdYellow()),
          }
          : null,
        group_label: groupLabel().trim(),
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
      header={mode === "create"
        ? t3({
          en: "Add Common Indicator",
          fr: "Ajouter un indicateur commun",
          pt: "Adicionar indicador comum",
        })
        : t3({
          en: "Update Common Indicator",
          fr: "Mettre à jour l'indicateur commun",
          pt: "Atualizar indicador comum",
        })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
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
      <Select
        label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
        value={type()}
        onChange={(v) => setType(v as CommonIndicatorType)}
        options={TYPE_OPTIONS}
        fullWidth
      />

      <Show when={type() === "base"}>
        <div class="ui-spy-sm">
          <div class="font-700 text-base-content text-sm">
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

      <Show when={type() !== "base"}>
        <Input
          label={type() === "population_rate"
            ? t3({
              en: "Numerator formula",
              fr: "Formule du numérateur",
              pt: "Fórmula do numerador",
            })
            : t3({ en: "Formula", fr: "Formule", pt: "Fórmula" })}
          value={expression()}
          onChange={setExpression}
          fullWidth
          mono
        />
        <div class="ui-text-caption text-xs">
          {t3({
            en: "Use + - * / and parentheses over other indicator IDs, e.g. anc4 / anc1. Wrap an ID in [brackets] if it is not all lowercase letters, digits and underscores. abs(), coalesce() and nullif() are available.",
            fr: "Utilisez + - * / et des parenthèses sur d'autres ID d'indicateurs, par ex. anc4 / anc1. Mettez un ID entre [crochets] s'il ne contient pas uniquement des minuscules, des chiffres et des tirets bas. abs(), coalesce() et nullif() sont disponibles.",
            pt: "Utilize + - * / e parênteses sobre outros IDs de indicadores, por ex. anc4 / anc1. Coloque um ID entre [parênteses retos] se não for composto apenas por minúsculas, dígitos e sublinhados. abs(), coalesce() e nullif() estão disponíveis.",
          })}
        </div>
        <Show when={expressionError()}>
          {(err) => <div class="text-danger text-xs">{err()}</div>}
        </Show>
      </Show>

      <Show when={type() === "population_rate"}>
        <Select
          label={t3({
            en: "Population",
            fr: "Population",
            pt: "População",
          })}
          value={populationType()}
          onChange={(v) => setPopulationType(v as PopulationType)}
          options={POPULATION_TYPES.map((pt) => ({
            value: pt.id,
            label: t3(pt.label),
          }))}
          fullWidth
        />
        <Input
          label={t3({
            en: "Population multiplier",
            fr: "Multiplicateur de population",
            pt: "Multiplicador da população",
          })}
          value={multiplier()}
          onChange={setMultiplier}
          fullWidth
        />
      </Show>

      <Select
        label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
        value={formatAs()}
        onChange={setFormatAs}
        options={FORMAT_OPTIONS}
        fullWidth
      />
      <Input
        label={t3({ en: "Group", fr: "Groupe", pt: "Grupo" })}
        value={groupLabel()}
        onChange={setGroupLabel}
        fullWidth
      />

      <Select
        label={t3({
          en: "Traffic-light thresholds",
          fr: "Seuils feu tricolore",
          pt: "Limiares tipo semáforo",
        })}
        value={thresholdsOn() ? "on" : "off"}
        onChange={(v) => setThresholdsOn(v === "on")}
        options={[
          { value: "off", label: t3({ en: "None", fr: "Aucun", pt: "Nenhum" }) },
          {
            value: "on",
            label: t3({ en: "Set", fr: "Définis", pt: "Definidos" }),
          },
        ]}
        fullWidth
      />
      <Show when={thresholdsOn()}>
        <Select
          label={t3({
            en: "Direction",
            fr: "Direction",
            pt: "Direção",
          })}
          value={thresholdDirection()}
          onChange={setThresholdDirection}
          options={[
            {
              value: "higher_is_better",
              label: t3({
                en: "Higher is better",
                fr: "Plus élevé est meilleur",
                pt: "Mais alto é melhor",
              }),
            },
            {
              value: "lower_is_better",
              label: t3({
                en: "Lower is better",
                fr: "Plus bas est meilleur",
                pt: "Mais baixo é melhor",
              }),
            },
          ]}
          fullWidth
        />
        <Input
          label={t3({ en: "Green at", fr: "Vert à", pt: "Verde em" })}
          value={thresholdGreen()}
          onChange={setThresholdGreen}
          fullWidth
        />
        <Input
          label={t3({ en: "Yellow at", fr: "Jaune à", pt: "Amarelo em" })}
          value={thresholdYellow()}
          onChange={setThresholdYellow}
          fullWidth
        />
      </Show>
    </AlertFormHolder>
  );
}
