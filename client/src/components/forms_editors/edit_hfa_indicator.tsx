import { HFA_INDICATOR_ID_REGEX, isReservedHfaId, type HfaIndicator, type HfaIndicatorCategory, type HfaIndicatorServiceCategory, type HfaIndicatorSubCategory, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  MultiSelect,
  RadioGroup,
  Select,
  TextArea,
  createFormAction,
} from "panther";
import { createSignal, Match, Switch } from "solid-js";
import { serverActions } from "~/server_actions";

export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      existingIndicator?: HfaIndicator;
      sortOrder: number;
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
      serviceCategories: HfaIndicatorServiceCategory[];
      variableIds: string[];
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";

  const [indicatorId, setIndicatorId] = createSignal(p.existingIndicator?.indicatorId ?? "");
  const [categoryId, setCategoryId] = createSignal<string | null>(p.existingIndicator?.categoryId ?? null);
  const [subCategoryId, setSubCategoryId] = createSignal<string | null>(p.existingIndicator?.subCategoryId ?? null);
  const [serviceCategoryIds, setServiceCategoryIds] = createSignal<string[]>(p.existingIndicator?.serviceCategoryIds ?? []);
  const [shortLabel, setShortLabel] = createSignal(p.existingIndicator?.shortLabel ?? "");
  const [definition, setDefinition] = createSignal(p.existingIndicator?.definition ?? "");
  const [type, setType] = createSignal<"binary" | "numeric">(p.existingIndicator?.type ?? "binary");
  const [aggregation, setAggregation] = createSignal<"sum" | "avg">(p.existingIndicator?.aggregation ?? "sum");

  const filteredSubCategories = () => {
    const catId = categoryId();
    if (!catId) return [];
    return p.subCategories.filter((sc) => sc.categoryId === catId);
  };

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      // The indicator id is immutable once created: hfa_indicator_code references it via
      // a non-cascading FK, so a rename would fail whenever code exists.
      const trimmedIndicatorId =
        mode === "create" ? indicatorId().trim() : p.existingIndicator!.indicatorId;
      if (!trimmedIndicatorId) {
        return { success: false, err: t3({ en: "Indicator ID is required", fr: "L'ID de l'indicateur est requis", pt: "O ID do indicador é obrigatório" }) };
      }
      if (mode === "create") {
        if (!HFA_INDICATOR_ID_REGEX.test(trimmedIndicatorId)) {
          return {
            success: false,
            err: t3({
              en: "Indicator ID must start with a letter and contain only letters, digits, and underscores (max 64 characters)",
              fr: "L'ID de l'indicateur doit commencer par une lettre et ne contenir que des lettres, des chiffres et des tirets bas (max 64 caractères)",
              pt: "O ID do indicador deve começar por uma letra e conter apenas letras, dígitos e sublinhados (máx. 64 caracteres)",
            }),
          };
        }
        if (isReservedHfaId(trimmedIndicatorId)) {
          return {
            success: false,
            err: t3({
              en: `"${trimmedIndicatorId}" is a reserved word (an R function or operator used in indicator code, or a column the analysis script generates). Choose a different ID.`,
              fr: `« ${trimmedIndicatorId} » est un mot réservé (une fonction ou un opérateur R utilisé dans le code des indicateurs, ou une colonne générée par le script d'analyse). Choisissez un autre ID.`,
              pt: `"${trimmedIndicatorId}" é uma palavra reservada (uma função ou operador R utilizado no código dos indicadores, ou uma coluna gerada pelo script de análise). Escolha um ID diferente.`,
            }),
          };
        }
        if (p.variableIds.includes(trimmedIndicatorId)) {
          return {
            success: false,
            err: t3({
              en: `"${trimmedIndicatorId}" is a survey variable ID. Using it would shadow the dataset column in other indicators' code. Choose a different ID.`,
              fr: `« ${trimmedIndicatorId} » est l'ID d'une variable d'enquête. L'utiliser masquerait la colonne du jeu de données dans le code des autres indicateurs. Choisissez un autre ID.`,
              pt: `"${trimmedIndicatorId}" é o ID de uma variável de inquérito. Utilizá-lo ocultaria a coluna do conjunto de dados no código dos outros indicadores. Escolha um ID diferente.`,
            }),
          };
        }
      }

      const indicator: HfaIndicator = {
        indicatorId: trimmedIndicatorId,
        categoryId: categoryId(),
        subCategoryId: subCategoryId(),
        serviceCategoryIds: serviceCategoryIds(),
        shortLabel: shortLabel().trim(),
        definition: definition().trim(),
        type: type(),
        aggregation: aggregation(),
        sortOrder: p.sortOrder,
        hasSyntaxError: p.existingIndicator?.hasSyntaxError ?? false,
        codeConsistent: p.existingIndicator?.codeConsistent ?? true,
        // Variant-group assignment lives in the code editor (where the
        // per-item slots are); this metadata modal preserves it untouched.
        variantGroupId: p.existingIndicator?.variantGroupId ?? null,
      };

      if (mode === "create") {
        return await serverActions.createHfaIndicator({
          indicator,
        });
      } else {
        return await serverActions.updateHfaIndicator({
          oldIndicatorId: p.existingIndicator!.indicatorId,
          indicator,
        });
      }
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="hfa-indicator-form"
      header={
        mode === "create"
          ? t3({ en: "Add HFA indicator", fr: "Ajouter un indicateur HFA", pt: "Adicionar indicador HFA" })
          : t3({ en: "Update HFA indicator", fr: "Mettre à jour l'indicateur HFA", pt: "Atualizar indicador HFA" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Switch>
          <Match when={mode === "create"}>
            <Input
              label={t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" })}
              value={indicatorId()}
              onChange={setIndicatorId}
              fullWidth
              autoFocus
              mono
            />
          </Match>
          <Match when={mode === "update"}>
            <div>
              <div class="ui-label">
                {t3({ en: "Indicator ID", fr: "ID de l'indicateur", pt: "ID do indicador" })}
              </div>
              <div class="ui-form-pad ui-form-text-size font-mono">
                {indicatorId()}
              </div>
            </div>
          </Match>
        </Switch>
        <Select
          label={t3({ en: "Category", fr: "Catégorie", pt: "Categoria" })}
          value={categoryId() ?? ""}
          onChange={(v) => {
            setCategoryId(v || null);
            setSubCategoryId(null);
          }}
          options={[
            { value: "", label: t3({ en: "— None —", fr: "— Aucune —", pt: "— Nenhuma —" }) },
            ...p.categories.map((c) => ({ value: c.id, label: c.label })),
          ]}
          fullWidth
        />
        <Select
          label={t3({ en: "Sub-category", fr: "Sous-catégorie", pt: "Subcategoria" })}
          value={subCategoryId() ?? ""}
          onChange={(v) => setSubCategoryId(v || null)}
          options={
            categoryId()
              ? [
                  { value: "", label: t3({ en: "— None —", fr: "— Aucune —", pt: "— Nenhuma —" }) },
                  ...filteredSubCategories().map((sc) => ({ value: sc.id, label: sc.label })),
                ]
              : [{ value: "", label: t3({ en: "— Select category first —", fr: "— Sélectionnez d'abord une catégorie —", pt: "— Selecione primeiro uma categoria —" }) }]
          }
          fullWidth
        />
        <MultiSelect
          label={t3({ en: "Service categories", fr: "Catégories de service", pt: "Categorias de serviço" })}
          values={serviceCategoryIds()}
          onChange={setServiceCategoryIds}
          options={p.serviceCategories.map((sc) => ({ value: sc.id, label: sc.label }))}
        />
        <Input
          label={t3({ en: "Short label", fr: "Libellé court", pt: "Etiqueta curta" })}
          value={shortLabel()}
          onChange={setShortLabel}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Long label", fr: "Libellé long", pt: "Etiqueta longa" })}
          value={definition()}
          onChange={setDefinition}
          fullWidth
          height="160px"
        />
        <RadioGroup
          label={t3({ en: "Type", fr: "Type", pt: "Tipo" })}
          value={type()}
          onChange={(v) => setType(v as "binary" | "numeric")}
          options={[
            { value: "binary", label: t3({ en: "Boolean (for percentages)", fr: "Booléen (pour les pourcentages)", pt: "Booleano (para percentagens)" }) },
            { value: "numeric", label: t3({ en: "Numeric (for averages/sums)", fr: "Numérique (pour les moyennes/sommes)", pt: "Numérico (para médias/somas)" }) },
          ]}
        />
        <RadioGroup
          label={t3({ en: "Aggregation", fr: "Agrégation", pt: "Agregação" })}
          value={aggregation()}
          onChange={(v) => setAggregation(v as "sum" | "avg")}
          options={[
            { value: "sum", label: t3({ en: "Sum", fr: "Somme", pt: "Soma" }) },
            { value: "avg", label: t3({ en: "Average", fr: "Moyenne", pt: "Média" }) },
          ]}
        />
      </div>
    </AlertFormHolder>
  );
}
