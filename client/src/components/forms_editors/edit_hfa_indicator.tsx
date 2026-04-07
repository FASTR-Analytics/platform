import { type HfaIndicator, t3 } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  RadioGroup,
  TextArea,
  timActionForm,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      existingIndicator?: HfaIndicator;
      sortOrder: number;
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";

  const [varName, setVarName] = createSignal(p.existingIndicator?.varName ?? "");
  const [category, setCategory] = createSignal(p.existingIndicator?.category ?? "");
  const [definition, setDefinition] = createSignal(p.existingIndicator?.definition ?? "");
  const [type, setType] = createSignal<"binary" | "numeric">(p.existingIndicator?.type ?? "binary");

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const trimmedVarName = varName().trim();
      if (!trimmedVarName) {
        return { success: false, err: t3({ en: "Variable name is required", fr: "Le nom de la variable est requis" }) };
      }

      const indicator: HfaIndicator = {
        varName: trimmedVarName,
        category: category().trim(),
        definition: definition().trim(),
        type: type(),
        sortOrder: p.sortOrder,
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
          ? t3({ en: "Add HFA indicator", fr: "Ajouter un indicateur HFA" })
          : t3({ en: "Update HFA indicator", fr: "Mettre à jour l'indicateur HFA" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Variable name", fr: "Nom de la variable" })}
          value={varName()}
          onChange={setVarName}
          fullWidth
          autoFocus
          mono
        />
        <Input
          label={t3({ en: "Category", fr: "Catégorie" })}
          value={category()}
          onChange={setCategory}
          fullWidth
        />
        <TextArea
          label={t3({ en: "Definition", fr: "Définition" })}
          value={definition()}
          onChange={setDefinition}
          fullWidth
          height="160px"
        />
        <RadioGroup
          label={t3({ en: "Type", fr: "Type" })}
          value={type()}
          onChange={(v) => setType(v as "binary" | "numeric")}
          options={[
            { value: "binary", label: t3({ en: "Boolean (for percentages)", fr: "Booléen (pour les pourcentages)" }) },
            { value: "numeric", label: t3({ en: "Numeric (for averages/sums)", fr: "Numérique (pour les moyennes/sommes)" }) },
          ]}
        />
      </div>
    </AlertFormHolder>
  );
}
