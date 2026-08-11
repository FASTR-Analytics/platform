import {
  HFA_VARIANT_ITEM_ID_REGEX,
  t3,
  type HfaIndicatorVariantGroup,
  type HfaIndicatorVariantItem,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  createFormAction,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { slugify } from "./_shared";

export function EditHfaIndicatorVariantItem(
  p: AlertComponentProps<
    {
      group: HfaIndicatorVariantGroup;
      existing?: HfaIndicatorVariantItem;
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
        if (!HFA_VARIANT_ITEM_ID_REGEX.test(newId)) {
          return {
            success: false,
            err: t3({
              en: `ID "${newId}" must start with a lowercase letter and contain only lowercase letters, digits, and underscores (max 64 characters)`,
              fr: `L'identifiant "${newId}" doit commencer par une lettre minuscule et ne contenir que des lettres minuscules, des chiffres et des tirets bas (64 caractères max)`,
              pt: `O ID "${newId}" deve começar por uma letra minúscula e conter apenas letras minúsculas, dígitos e sublinhados (máx. 64 caracteres)`,
            }),
          };
        }
        if (p.existingIds.includes(newId)) {
          return {
            success: false,
            err: t3({ en: `ID "${newId}" already exists`, fr: `L'identifiant "${newId}" existe déjà`, pt: `O ID "${newId}" já existe` }),
          };
        }
        return await serverActions.createHfaIndicatorVariantItem({
          item: {
            id: newId,
            groupId: p.group.id,
            label: trimmedLabel,
            sortOrder: p.sortOrder,
          },
        });
      }

      return await serverActions.updateHfaIndicatorVariantItem({
        oldId: p.existing!.id,
        item: {
          id: p.existing!.id,
          groupId: p.existing!.groupId,
          label: trimmedLabel,
          sortOrder: p.existing!.sortOrder,
        },
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="hfa-variant-item-form"
      header={
        mode === "create"
          ? t3({ en: "Add variant item", fr: "Ajouter un élément de variante", pt: "Adicionar item de variante" })
          : t3({ en: "Update variant item", fr: "Mettre à jour l'élément de variante", pt: "Atualizar item de variante" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <div class="ui-text-caption">{t3({ en: "Variant group", fr: "Groupe de variantes", pt: "Grupo de variantes" })}</div>
          <div class="font-700 text-sm">{p.group.label}</div>
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
            <div class="ui-text-caption">{t3({ en: "ID", fr: "Identifiant", pt: "ID" })}</div>
            <div class="font-mono text-sm">{p.existing!.id}</div>
          </div>
        )}
      </div>
    </AlertFormHolder>
  );
}
