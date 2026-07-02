import { HFA_VAR_NAME_REGEX, type HfaIndicator, type HfaIndicatorCategory, type HfaIndicatorServiceCategory, type HfaIndicatorSubCategory, t3 } from "lib";
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
      surveyVarNames: string[];
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";

  const [varName, setVarName] = createSignal(p.existingIndicator?.varName ?? "");
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

      // varName is immutable once created: hfa_indicator_code references it via
      // a non-cascading FK, so a rename would fail whenever code exists.
      const trimmedVarName =
        mode === "create" ? varName().trim() : p.existingIndicator!.varName;
      if (!trimmedVarName) {
        return { success: false, err: t3({ en: "Variable name is required", fr: "Le nom de la variable est requis", pt: "O nome da variável é obrigatório" }) };
      }
      if (mode === "create") {
        if (!HFA_VAR_NAME_REGEX.test(trimmedVarName)) {
          return {
            success: false,
            err: t3({
              en: "Variable name must start with a letter and contain only letters, digits, and underscores (max 64 characters)",
              fr: "Le nom de la variable doit commencer par une lettre et ne contenir que des lettres, des chiffres et des tirets bas (max 64 caractères)",
              pt: "O nome da variável deve começar por uma letra e conter apenas letras, dígitos e sublinhados (máx. 64 caracteres)",
            }),
          };
        }
        if (p.surveyVarNames.includes(trimmedVarName)) {
          return {
            success: false,
            err: t3({
              en: `"${trimmedVarName}" is a survey variable name — using it would shadow the dataset column in other indicators' code. Choose a different name.`,
              fr: `« ${trimmedVarName} » est le nom d'une variable d'enquête — l'utiliser masquerait la colonne du jeu de données dans le code des autres indicateurs. Choisissez un autre nom.`,
              pt: `"${trimmedVarName}" é o nome de uma variável de inquérito — utilizá-lo ocultaria a coluna do conjunto de dados no código dos outros indicadores. Escolha um nome diferente.`,
            }),
          };
        }
      }

      const indicator: HfaIndicator = {
        varName: trimmedVarName,
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
      };

      if (mode === "create") {
        return await serverActions.createHfaIndicator({
          indicator,
        });
      } else {
        return await serverActions.updateHfaIndicator({
          oldVarName: p.existingIndicator!.varName,
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
              label={t3({ en: "Variable name", fr: "Nom de la variable", pt: "Nome da variável" })}
              value={varName()}
              onChange={setVarName}
              fullWidth
              autoFocus
              mono
            />
          </Match>
          <Match when={mode === "update"}>
            <div>
              <div class="ui-label">
                {t3({ en: "Variable name", fr: "Nom de la variable", pt: "Nome da variável" })}
              </div>
              <div class="ui-form-pad ui-form-text-size font-mono">
                {varName()}
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
