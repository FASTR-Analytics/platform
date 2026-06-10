import { type HfaIndicatorServiceCategory, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function EditHfaIndicatorServiceCategory(
  p: AlertComponentProps<
    {
      existing?: HfaIndicatorServiceCategory;
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

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const trimmedLabel = label().trim();
      if (!trimmedLabel) {
        return { success: false, err: t3({ en: "Label is required", fr: "Le libellé est requis" }) };
      }

      if (mode === "create") {
        const newId = derivedId();
        if (!newId) {
          return { success: false, err: t3({ en: "ID is required", fr: "L'identifiant est requis" }) };
        }
        if (p.existingIds.includes(newId)) {
          return {
            success: false,
            err: t3({ en: `ID "${newId}" already exists`, fr: `L'identifiant "${newId}" existe déjà` }),
          };
        }
        return await serverActions.createHfaIndicatorServiceCategory({
          serviceCategory: { id: newId, label: trimmedLabel, sortOrder: p.sortOrder },
        });
      }

      return await serverActions.updateHfaIndicatorServiceCategory({
        oldId: p.existing!.id,
        serviceCategory: { id: p.existing!.id, label: trimmedLabel, sortOrder: p.existing!.sortOrder },
      });
    },
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="hfa-service-category-form"
      header={
        mode === "create"
          ? t3({ en: "Add service category", fr: "Ajouter une catégorie de service" })
          : t3({ en: "Update service category", fr: "Mettre à jour la catégorie de service" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Label", fr: "Libellé" })}
          value={label()}
          onChange={setLabel}
          fullWidth
          autoFocus
        />
        {mode === "create" ? (
          <Input
            label={t3({ en: "ID", fr: "Identifiant" })}
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
            <div class="text-neutral text-xs">{t3({ en: "ID", fr: "Identifiant" })}</div>
            <div class="font-mono text-sm">{p.existing!.id}</div>
          </div>
        )}
      </div>
    </AlertFormHolder>
  );
}
