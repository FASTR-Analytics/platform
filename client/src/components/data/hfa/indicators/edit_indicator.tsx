import { type HfaIndicator, type HfaIndicatorCategory, type HfaIndicatorServiceCategory, type HfaIndicatorSubCategory, t3 } from "lib";
import {
  AlertComponentProps,
  ModalContainer,
  Input,
  MultiSelect,
  RadioGroup,
  Select,
  TextArea,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      existingIndicator?: HfaIndicator;
      sortOrder: number;
      categories: HfaIndicatorCategory[];
      subCategories: HfaIndicatorSubCategory[];
      serviceCategories: HfaIndicatorServiceCategory[];
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";

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

      const indicator = {
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
        return await serverActions.createHfaIndicator({ indicator });
      }
      return await serverActions.updateHfaIndicator({
        indicator: { indicatorId: p.existingIndicator!.indicatorId, ...indicator },
      });
    },
    () => p.close(undefined),
  );

  return (
    <ModalContainer
      title={
        mode === "create"
          ? t3({ en: "Add HFA indicator", fr: "Ajouter un indicateur HFA", pt: "Adicionar indicador HFA" })
          : t3({ en: "Update HFA indicator", fr: "Mettre à jour l'indicateur HFA", pt: "Atualizar indicador HFA" })
      }
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
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
    </ModalContainer>
  );
}
