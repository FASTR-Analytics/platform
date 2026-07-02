import { type HfaIndicatorCategory, type HfaIndicatorSubCategory, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { slugify } from "./_shared";

export function EditHfaIndicatorSubCategory(
  p: AlertComponentProps<
    {
      category: HfaIndicatorCategory;
      existing?: HfaIndicatorSubCategory;
      sortOrder: number;
      existingIds: string[];
    },
    undefined
  >,
) {
  const mode = p.existing ? "update" : "create";

  const [label, setLabel] = createSignal(p.existing?.label ?? "");
  const [id, setId] = createSignal(p.existing?.id ?? "");
  const [idEdited, setIdEdited] = createSignal(false);

  const derivedId = () => (idEdited() ? id() : slugify(label()));

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();

      const trimmedLabel = label().trim();
      if (!trimmedLabel) {
        return { success: false, err: t3({ en: "Label is required", fr: "Le libellé est requis", pt: "A etiqueta é obrigatória" }) };
      }

      if (mode === "create") {
        const newId = derivedId();
        if (!newId) {
          return { success: false, err: t3({ en: "ID is required", fr: "L'identifiant est requis", pt: "O ID é obrigatório" }) };
        }
        if (p.existingIds.includes(newId)) {
          return {
            success: false,
            err: t3({ en: `ID "${newId}" already exists`, fr: `L'identifiant "${newId}" existe déjà`, pt: `O ID "${newId}" já existe` }),
          };
        }
        return await serverActions.createHfaIndicatorSubCategory({
          subCategory: {
            id: newId,
            categoryId: p.category.id,
            label: trimmedLabel,
            sortOrder: p.sortOrder,
          },
        });
      }

      return await serverActions.updateHfaIndicatorSubCategory({
        oldId: p.existing!.id,
        subCategory: {
          id: p.existing!.id,
          categoryId: p.existing!.categoryId,
          label: trimmedLabel,
          sortOrder: p.existing!.sortOrder,
        },
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="hfa-sub-category-form"
      header={
        mode === "create"
          ? t3({ en: "Add sub-category", fr: "Ajouter une sous-catégorie", pt: "Adicionar subcategoria" })
          : t3({ en: "Update sub-category", fr: "Mettre à jour la sous-catégorie", pt: "Atualizar subcategoria" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <div class="text-neutral text-xs">{t3({ en: "Category", fr: "Catégorie", pt: "Categoria" })}</div>
          <div class="font-700 text-sm">{p.category.label}</div>
        </div>
        <Input
          label={t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" })}
          value={label()}
          onChange={setLabel}
          fullWidth
          autoFocus
        />
        {mode === "create" ? (
          <Input
            label={t3({ en: "ID", fr: "Identifiant", pt: "ID" })}
            value={derivedId()}
            onChange={(v) => {
              setIdEdited(true);
              setId(v);
            }}
            fullWidth
            mono
          />
        ) : (
          <div class="ui-spy-sm">
            <div class="text-neutral text-xs">{t3({ en: "ID", fr: "Identifiant", pt: "ID" })}</div>
            <div class="font-mono text-sm">{p.existing!.id}</div>
          </div>
        )}
      </div>
    </AlertFormHolder>
  );
}
