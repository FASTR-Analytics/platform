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
      silentRefreshIndicators: () => Promise<void>;
    },
    undefined
  >,
) {
  const mode = p.existingIndicator ? "update" : "create";

  const [varName, setVarName] = createSignal(p.existingIndicator?.varName ?? "");
  const [category, setCategory] = createSignal(p.existingIndicator?.category ?? "");
  const [definition, setDefinition] = createSignal(p.existingIndicator?.definition ?? "");
  const [type, setType] = createSignal<"binary" | "numeric">(p.existingIndicator?.type ?? "binary");
  const [rCode, setRCode] = createSignal(p.existingIndicator?.rCode ?? "");
  const [rFilterCode, setRFilterCode] = createSignal(p.existingIndicator?.rFilterCode ?? "");

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      const trimmedVarName = varName().trim();
      if (!trimmedVarName) {
        return { success: false, err: t3({ en: "Variable name is required", fr: "Le nom de la variable est requis" }) };
      }
      if (!rCode().trim()) {
        return { success: false, err: t3({ en: "R code is required", fr: "Le code R est requis" }) };
      }

      const indicator: HfaIndicator = {
        varName: trimmedVarName,
        category: category().trim(),
        definition: definition().trim(),
        type: type(),
        rCode: rCode().trim(),
        rFilterCode: rFilterCode().trim() || undefined,
      };

      if (mode === "create") {
        return await serverActions.createHfaIndicator({
          indicator,
          sortOrder: p.sortOrder,
        });
      } else {
        return await serverActions.updateHfaIndicator({
          oldVarName: p.existingIndicator!.varName,
          indicator,
          sortOrder: p.sortOrder,
        });
      }
    },
    p.silentRefreshIndicators,
    () => p.close(undefined),
  );

  return (
    <AlertFormHolder
      formId="hfa-indicator-form"
      header={
        mode === "create"
          ? t3({ en: "Add HFA Indicator", fr: "Ajouter un indicateur HFA" })
          : t3({ en: "Update HFA Indicator", fr: "Mettre à jour l'indicateur HFA" })
      }
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <div class="ui-gap grid grid-cols-1 lg:grid-cols-2">
        <div class="ui-spy">
          <Input
            label={t3({ en: "Variable Name", fr: "Nom de la variable" })}
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
        </div>
        <div class="ui-spy">
          <RadioGroup
            label={t3({ en: "Type", fr: "Type" })}
            value={type()}
            onChange={(v) => setType(v as "binary" | "numeric")}
            options={[
              { value: "binary", label: t3({ en: "Boolean (for percentages)", fr: "Booléen (pour les pourcentages)" }) },
              { value: "numeric", label: t3({ en: "Numeric (for averages/sums)", fr: "Numérique (pour les moyennes/sommes)" }) },
            ]}
          />
          <div>
            <TextArea
              label={t3({ en: "R Code", fr: "Code R" })}
              value={rCode()}
              onChange={setRCode}
              fullWidth
              height="80px"
              mono
            />
            <div class="text-xs">
              {type() === "binary"
                ? t3({ en: "Should evaluate to boolean TRUE/FALSE", fr: "Doit évaluer à TRUE/FALSE (booléen)" })
                : t3({ en: "Should evaluate to a numeric value", fr: "Doit évaluer à une valeur numérique" })}
            </div>
          </div>
          <div>
            <TextArea
              label={t3({ en: "Filter Code (should evaluate to boolean TRUE/FALSE)", fr: "Code de filtre (doit évaluer à TRUE/FALSE booléen)" })}
              value={rFilterCode()}
              onChange={setRFilterCode}
              fullWidth
              mono
              height="80px"
              placeholder={t3({ en: "R expression to filter facilities (e.g., facility_type == 'urban')", fr: "Expression R pour filtrer les établissements (ex. facility_type == 'urban')" })}
            />
            <div class="text-xs">
              {t3({ en: "Should evaluate to boolean TRUE/FALSE", fr: "Doit évaluer à TRUE/FALSE (booléen)" })}
            </div>
          </div>
        </div>
      </div>
    </AlertFormHolder>
  );
}
