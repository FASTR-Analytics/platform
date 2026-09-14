// Create/update one indicator. The form branches on what the indicator IS
// (PLAN_A5 §2, PLAN_A6 §2): an Uploaded indicator is a count filled by CSV
// import, whose mapping step points file values at it (its key is the
// server's and never shown), a DHIS2 element a count the import fetches
// under its DHIS2 id, a sum the total of indicators that have rows, a
// derived one a formula over other indicators and population terms with a
// free display format. Every indicator carries the include-in-analysis
// checkbox. The id is renamable (ruling 5); a DHIS2 id is fixed once rows
// exist under it (ruling 4). The palette below the formula inserts
// correctly written identifiers, and the legend names every identifier the
// formula references.
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
  buildHmisIndicatorDictionary,
  type HmisIndicator,
  collectIdentifiers,
  definitionDataId,
  hasRows,
  type HmisIndicatorDefinitionInput,
  type HmisIndicatorType,
  HMIS_INDICATOR_TYPES,
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
import { TypeFactsList } from "./_type_facts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  computabilityProblemText,
  populationCoverageSummary,
} from "./_computability";
import {
  dhis2IdLabel,
  indicatorFormatWord,
  indicatorTypeWord,
} from "./_indicator_display";
import { SpecialBadge } from "./_special_badge";

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

// Resolved per render, never at module scope: the language is set after the
// module graph is evaluated, so a frozen label would always be English.
function typeOptions() {
  return HMIS_INDICATOR_TYPES.map((type) => ({
    value: type,
    label: indicatorTypeWord(type),
  }));
}

const INDICATOR_FORMATS: readonly IndicatorFormat[] = [
  "number",
  "percent",
  "rate_per_10k",
];

function formatOptions() {
  return INDICATOR_FORMATS.map((value) => ({
    value,
    label: indicatorFormatWord(value),
  }));
}

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
      indicators: HmisIndicator[];
      // The counts that have rows, as the manager knows them from the
      // ledger; undefined while it is still loading, when no ingredient is
      // judged to be missing data and a set data id is treated as fixed.
      idsWithData: Set<string> | undefined;
      existingIndicator?: HmisIndicator;
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
  const [type, setType] = createSignal<HmisIndicatorType>(
    existing?.definition.type ?? "dhis2_element",
  );
  // The DHIS2 id input only: an Uploaded indicator's key is the server's.
  const [dataId, setDataId] = createSignal(
    existing?.definition.type === "dhis2_element" ? existing.definition.data_id : "",
  );
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
  // A count (Uploaded, DHIS2 element or Sum): its format is always a number.
  const effectiveFormatAs = (): IndicatorFormat =>
    type() === "derived" ? formatAs() : "number";

  const ownId = () => indicatorId().trim() || "__new__";
  const isSpecial = () => isSpecialIndicatorId(indicatorId().trim());
  const existingIsSpecial = existing !== undefined &&
    isSpecialIndicatorId(existing.indicator_common_id);
  const renaming = () =>
    existing !== undefined && indicatorId().trim() !== existing.indicator_common_id;

  // Whether rows exist under the indicator's data id (ruling 4): the ledger's
  // answer through idsWithData; while that is unknown, an indicator with a
  // key counts as having rows, since the server refuses the change either way.
  const existingHasRows = (): boolean =>
    existing !== undefined &&
    definitionDataId(existing.definition) !== null &&
    (p.idsWithData?.has(existing.indicator_common_id) ?? true);
  const dataIdLocked = () => existingHasRows();

  // The sums that name the indicator being edited: a switch out of the
  // types that have rows is refused while one does (ruling 3).
  const namingSums = createMemo(() =>
    existing === undefined ? [] : p.indicators
      .filter((c) =>
        c.definition.type === "sum" &&
        c.definition.members.includes(existing.indicator_common_id)
      )
      .map((c) => c.indicator_common_id)
  );

  function currentDefinition(): HmisIndicatorDefinitionInput {
    switch (type()) {
      case "derived":
        return { type: "derived", expression: expression().trim() };
      case "sum":
        return { type: "sum", members: members() };
      case "uploaded":
        return { type: "uploaded" };
      case "dhis2_element":
        return { type: "dhis2_element", data_id: dataId().trim() };
    }
  }

  // The other indicators a formula or a member list may name: never the one
  // being edited (under its stored id, whatever is typed in the id box).
  const otherIndicators = createMemo(() =>
    p.indicators.filter((c) =>
      c.indicator_common_id !== (existing?.indicator_common_id ?? ownId())
    ),
  );

  const memberOptions = createMemo(() =>
    otherIndicators()
      .filter((c) => hasRows(c.definition.type))
      .map((c) => ({
        value: c.indicator_common_id,
        label: `${c.indicator_common_label} (${c.indicator_common_id})`,
      })),
  );

  // Every data id another indicator carries, whatever its type (a DHIS2
  // element retyped to Uploaded keeps its UID as its key): one indicator
  // carries one, so typing one of these as a DHIS2 id is refused here
  // before the server does.
  const dataIdOwners = createMemo(() => {
    const owners = new Map<string, HmisIndicator>();
    for (const c of otherIndicators()) {
      const id = definitionDataId(c.definition);
      if (id !== null) owners.set(id, c);
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
      const dictionary = buildHmisIndicatorDictionary(
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

  // One indicator carries one id: a new id (created, or renamed to) that
  // another indicator holds is refused here before the server does, live
  // under the input and again on save.
  function idTakenError(): string | undefined {
    if (existing !== undefined && !renaming()) return undefined;
    const id = indicatorId().trim();
    if (id !== "" && p.indicators.some((c) => c.indicator_common_id === id)) {
      return t3({
        en: `Indicator ID "${id}" is already taken`,
        fr: `L'identifiant d'indicateur « ${id} » est déjà utilisé`,
        pt: `O ID de indicador "${id}" já está a ser utilizado`,
      });
    }
    return undefined;
  }

  // The type switches the server refuses (ruling 3): out of the types that
  // have rows while rows exist or while a sum names the indicator; into
  // DHIS2 element without a DHIS2-shaped data id.
  function typeSwitchError(): string | undefined {
    if (existing === undefined) return undefined;
    if (hasRows(existing.definition.type) && !hasRows(type())) {
      if (existingHasRows()) {
        return t3({
          en: `${existing.indicator_common_id} has data, so it cannot become a ${indicatorTypeWord(type())}. Delete its data first.`,
          fr: `${existing.indicator_common_id} contient des données et ne peut donc pas devenir ${indicatorTypeWord(type())}. Supprimez d'abord ses données.`,
          pt: `${existing.indicator_common_id} tem dados, pelo que não pode tornar-se ${indicatorTypeWord(type())}. Elimine primeiro os seus dados.`,
        });
      }
      const sums = namingSums();
      if (sums.length > 0) {
        return t3({
          en: `${existing.indicator_common_id} is a member of ${sums.join(", ")}, so it cannot become a ${indicatorTypeWord(type())}. Remove it from those sums first.`,
          fr: `${existing.indicator_common_id} est membre de ${sums.join(", ")} et ne peut donc pas devenir ${indicatorTypeWord(type())}. Retirez-le d'abord de ces sommes.`,
          pt: `${existing.indicator_common_id} é membro de ${sums.join(", ")}, pelo que não pode tornar-se ${indicatorTypeWord(type())}. Remova-o primeiro dessas somas.`,
        });
      }
    }
    return undefined;
  }

  function definitionError(): string | undefined {
    const switchErr = typeSwitchError();
    if (switchErr !== undefined) return switchErr;
    if (type() === "dhis2_element") {
      const id = dataId().trim();
      if (id === "") {
        return t3({
          en: "A DHIS2 element needs a DHIS2 id",
          fr: "Un élément DHIS2 nécessite un identifiant DHIS2",
          pt: "Um elemento DHIS2 precisa de um ID DHIS2",
        });
      }
      if (!isDhis2ShapedId(id)) {
        return t3({
          en: `DHIS2 id "${id}" must be a data element UID (11 characters) or a UID.COC operand`,
          fr: `L'identifiant DHIS2 « ${id} » doit être un UID d'élément de données (11 caractères) ou un opérande UID.COC`,
          pt: `O ID DHIS2 "${id}" tem de ser um UID de elemento de dados (11 caracteres) ou um operando UID.COC`,
        });
      }
      const owner = dataIdOwners().get(id);
      if (owner !== undefined) {
        return t3({
          en: `DHIS2 id "${id}" already belongs to ${owner.indicator_common_id}. One indicator carries one; make a sum or a derived indicator over ${owner.indicator_common_id} instead.`,
          fr: `L'identifiant DHIS2 « ${id} » appartient déjà à ${owner.indicator_common_id}. Un indicateur n'en porte qu'un ; créez plutôt une somme ou un indicateur dérivé sur ${owner.indicator_common_id}.`,
          pt: `O ID DHIS2 "${id}" já pertence a ${owner.indicator_common_id}. Um indicador tem um único; crie antes uma soma ou um indicador derivado sobre ${owner.indicator_common_id}.`,
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
    if (type() === "derived") return expressionError();
    return undefined;
  }

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const id = indicatorId().trim();
      const label = indicatorLabel().trim();

      if (!id) {
        return {
          success: false,
          err: t3({
            en: "Indicator ID is required",
            fr: "L'identifiant de l'indicateur est requis",
            pt: "O ID do indicador é obrigatório",
          }),
        };
      }

      const takenErr = idTakenError();
      if (takenErr) {
        return { success: false, err: takenErr };
      }

      // A new id (created or renamed to) goes through the validator; an
      // existing id kept as it is only through the type rule (its charset
      // is grandfathered).
      const idIssue = mode === "create" || renaming()
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
      if (idIssue === "special_derived") {
        return {
          success: false,
          err: t3({
            en: `"${id}" is a special indicator ID, which the analysis modules read as a count, so it can only be a DHIS2 element, Uploaded or a Sum (special: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            fr: `« ${id} » est un identifiant d'indicateur spécial, lu comme un dénombrement par les modules d'analyse, et ne peut donc être qu'un élément DHIS2, téléversé ou une somme (spéciaux : ${SPECIAL_INDICATOR_IDS.join(", ")})`,
            pt: `"${id}" é um ID de indicador especial, lido como uma contagem pelos módulos de análise, pelo que só pode ser um elemento DHIS2, carregado ou uma soma (especiais: ${SPECIAL_INDICATOR_IDS.join(", ")})`,
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
        include_in_analysis: isSpecial() || includeInAnalysis(),
        format_as: effectiveFormatAs(),
        thresholds: type() === "derived" ? rule : null,
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

  const idCaption = (): string | undefined => {
    if (mode === "create") return undefined;
    if (existingIsSpecial) {
      return t3({
        en: "The analysis modules read this id by name: renaming it takes it out of their inputs until a count carries the id again. Renaming rewrites every formula and import schedule that names it; its data stays where it is.",
        fr: "Les modules d'analyse lisent cet identifiant par son nom : le renommer le retire de leurs entrées jusqu'à ce qu'un dénombrement porte à nouveau cet identifiant. Renommer réécrit chaque formule et chaque importation planifiée qui le nomme ; ses données restent en place.",
        pt: "Os módulos de análise leem este ID pelo nome: renomeá-lo retira-o das suas entradas até uma contagem voltar a ter este ID. Renomear reescreve todas as fórmulas e importações agendadas que o nomeiam; os seus dados ficam onde estão.",
      });
    }
    return t3({
      en: "Renaming rewrites every formula and import schedule that names this indicator. Its data stays where it is, and results packages already generated keep the old id.",
      fr: "Renommer réécrit chaque formule et chaque importation planifiée qui nomme cet indicateur. Ses données restent en place, et les paquets de résultats déjà générés conservent l'ancien identifiant.",
      pt: "Renomear reescreve todas as fórmulas e importações agendadas que nomeiam este indicador. Os seus dados ficam onde estão, e os pacotes de resultados já gerados mantêm o ID antigo.",
    });
  };

  const dhis2IdCaption = (): string =>
    dataIdLocked()
      ? t3({
        en: "The DHIS2 data element or operand this indicator is fetched from. It is fixed while the indicator has data; rename the indicator to change its name.",
        fr: "L'élément de données ou l'opérande DHIS2 dont cet indicateur est récupéré. Il est fixe tant que l'indicateur contient des données ; renommez l'indicateur pour changer son nom.",
        pt: "O elemento de dados ou operando DHIS2 de onde este indicador é obtido. É fixo enquanto o indicador tiver dados; renomeie o indicador para mudar o seu nome.",
      })
      : t3({
        en: "The DHIS2 data element UID or UID.COC operand the import fetches. Its rows are stored under this id.",
        fr: "L'UID d'élément de données ou l'opérande UID.COC que l'importation récupère. Ses lignes sont conservées sous cet identifiant.",
        pt: "O UID de elemento de dados ou o operando UID.COC que a importação obtém. As suas linhas são guardadas sob este ID.",
      });

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
        <div class="ui-spy-sm">
          <Input
            label={t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" })}
            value={indicatorId()}
            onChange={setIndicatorId}
            fullWidth
            autoFocus={mode === "create"}
            mono
          />
          <Show when={isSpecial()}>
            <div>
              <SpecialBadge />
            </div>
          </Show>
          <Show when={idCaption()}>
            {(caption) => <div class="ui-text-caption">{caption()}</div>}
          </Show>
          <Show when={idTakenError()}>
            {(err) => <div class="text-danger text-xs">{err()}</div>}
          </Show>
        </div>
        <Input
          label={t3(TC.label)}
          value={indicatorLabel()}
          onChange={setIndicatorLabel}
          fullWidth
        />
      </div>
      <div class="ui-spy-sm">
        <Select
          label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
          value={type()}
          onChange={(v) => setType(v as HmisIndicatorType)}
          options={typeOptions()}
          fullWidth
        />
        <TypeFactsList type={type()} />
        <Show when={typeSwitchError()}>
          {(err) => <div class="text-danger text-xs">{err()}</div>}
        </Show>
      </div>

      <div class="ui-gap grid grid-cols-[repeat(auto-fit,minmax(24rem,1fr))] items-start">
        <div class="ui-spy-sm">
          <div class="font-700 text-base-content text-sm">
            {t3({ en: "Definition", fr: "Définition", pt: "Definição" })}
          </div>

          <Show when={type() === "uploaded"}>
            <div class="ui-text-caption">
              {t3({
                en: "An indicator of type Uploaded has no definition to author. FASTR gives it an internal identifier that CSV imports write to; you never see or type it.",
                fr: "Un indicateur de type Téléversé n'a pas de définition à rédiger. FASTR lui attribue un identifiant interne dans lequel les importations CSV écrivent ; vous ne le voyez ni ne le saisissez jamais.",
                pt: "Um indicador do tipo Carregado não tem definição para redigir. O FASTR atribui-lhe um identificador interno no qual as importações CSV escrevem; nunca o vê nem o digita.",
              })}
            </div>
          </Show>

          <Show when={type() === "dhis2_element"}>
            <Input
              label={dhis2IdLabel()}
              value={dataId()}
              onChange={setDataId}
              disabled={dataIdLocked()}
              mono
              fullWidth
            />
            <div class="ui-text-caption">{dhis2IdCaption()}</div>
          </Show>

          <Show when={type() === "sum"}>
            <MultiSelectSearch
              label={t3({ en: "Members", fr: "Membres", pt: "Membros" })}
              options={memberOptions()}
              values={members()}
              onChange={setMembers}
              placeholder={t3({
                en: "Search indicators...",
                fr: "Rechercher des indicateurs...",
                pt: "Pesquisar indicadores...",
              })}
              fullWidth
            />
            <div class="ui-text-caption">
              {t3({
                en: "The members' counts are added per facility and month. Members are indicators of type DHIS2 element or Uploaded; a sum cannot contain a sum.",
                fr: "Les dénombrements des membres sont additionnés par établissement et par mois. Les membres sont des indicateurs de type Élément DHIS2 ou Téléversé ; une somme ne peut pas contenir une somme.",
                pt: "As contagens dos membros são somadas por estabelecimento e mês. Os membros são indicadores do tipo Elemento DHIS2 ou Carregado; uma soma não pode conter uma soma.",
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
            <div class="ui-text-caption">
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
                              classList={{
                                "text-danger": coverage().empty,
                                "text-base-content-muted": !coverage().empty,
                              }}
                            >
                              {coverage().text}
                            </span>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={legendNamesPopulation()}>
                    <div class="ui-text-caption">
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
            checked={isSpecial() || includeInAnalysis()}
            onChange={setIncludeInAnalysis}
            disabled={isSpecial()}
          />
          <div class="ui-text-caption">
            {isSpecial()
              ? t3({
                en: "A special indicator is always analysed.",
                fr: "Un indicateur spécial est toujours analysé.",
                pt: "Um indicador especial é sempre analisado.",
              })
              : t3({
                en: "On: every results package analyses this indicator. Off: dictionary only; its data is still imported and stored, and it can still be a member of a sum or used in a formula.",
                fr: "Coché : chaque paquet de résultats analyse cet indicateur. Décoché : dictionnaire seulement ; ses données sont toujours importées et conservées, et il peut toujours être membre d'une somme ou utilisé dans une formule.",
                pt: "Marcado: todos os pacotes de resultados analisam este indicador. Desmarcado: apenas dicionário; os seus dados continuam a ser importados e guardados, e pode continuar a ser membro de uma soma ou usado numa fórmula.",
              })}
          </div>
          <Show when={type() === "derived"}>
            <Select
              label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
              value={formatAs()}
              onChange={setFormatAs}
              options={formatOptions()}
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
                    ? (thresholds() ?? defaultIndicatorRule(formatAs()))
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
                  formatAs={formatAs()}
                  decimalPlaces={0}
                  showLabels={true}
                  showPresets={false}
                />
              )}
            </Show>
          </Show>
        </div>
      </div>
    </AlertFormHolder>
  );
}
