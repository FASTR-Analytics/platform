import { type HfaIndicator, t3, TC } from "lib";
import { AlertComponentProps, Button, Input, ModalContainer, RadioGroup, TextArea } from "panther";
import { createStore } from "solid-js/store";

export function EditHfaIndicator(
  p: AlertComponentProps<
    {
      indicator: HfaIndicator;
    },
    "NEEDS_UPDATE" | undefined
  >,
) {
  const [tempIndicator, setTempIndicator] = createStore(p.indicator);

  return (
    <ModalContainer
      title={t3({ en: "Edit Indicator", fr: "Modifier l'indicateur" })}
      width="xl"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close("NEEDS_UPDATE")}
            iconName="save"
            intent="success"
          >
            {t3(TC.save)}
          </Button>,
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t3(TC.cancel)}
          </Button>,
        ]
      }
    >
      <div class="ui-gap grid grid-cols-1 lg:grid-cols-2">
        <div class="ui-spy">

          <Input
            label={t3({ en: "Variable Name", fr: "Nom de la variable" })}
            value={tempIndicator.varName}
            onChange={(v) => setTempIndicator("varName", v)}
            fullWidth
          />
          <Input
            label={t3({ en: "Category", fr: "Catégorie" })}
            value={tempIndicator.category}
            onChange={(v) => setTempIndicator("category", v)}
            fullWidth
          />
          <TextArea
            label={t3({ en: "Definition", fr: "Définition" })}
            value={tempIndicator.definition}
            onChange={(v) => setTempIndicator("definition", v)}
            fullWidth
            height="160px"
          />


        </div>

        <div class="ui-spy">

          <RadioGroup
            label={t3({ en: "Type", fr: "Type" })}
            value={tempIndicator.type}
            onChange={(v) => setTempIndicator("type", v as "binary" | "numeric")}
            options={[
              { value: "binary", label: t3({ en: "Boolean (for percentages)", fr: "Booléen (pour les pourcentages)" }) },
              { value: "numeric", label: t3({ en: "Numeric (for averages/sums)", fr: "Numérique (pour les moyennes/sommes)" }) },
            ]}
          />
          <div class="">
            <TextArea
              label={t3({ en: "R Code", fr: "Code R" })}
              value={tempIndicator.rCode}
              onChange={(v) => setTempIndicator("rCode", v)}
              fullWidth
              height="80px"
              mono
            />
            <div class="text-xs">{
              tempIndicator.type === "binary"
                ? t3({ en: "Should evaluate to boolean TRUE/FALSE", fr: "Doit évaluer à TRUE/FALSE (booléen)" })
                : t3({ en: "Should evaluate to a numeric value", fr: "Doit évaluer à une valeur numérique" })
            }</div></div>
          <div class="text-xs">
            <TextArea
              label={t3({ en: "Filter Code (should evaluate to boolean TRUE/FALSE)", fr: "Code de filtre (doit évaluer à TRUE/FALSE booléen)" })}
              value={tempIndicator.rFilterCode ?? ""}
              onChange={(v) => setTempIndicator("rFilterCode", v)}
              fullWidth
              mono
              height="80px"
              placeholder={t3({ en: "R expression to filter facilities (e.g., facility_type == 'urban')", fr: "Expression R pour filtrer les établissements (ex. facility_type == 'urban')" })}
            />
            <div class="text-xs">{t3({ en: "Should evaluate to boolean TRUE/FALSE", fr: "Doit évaluer à TRUE/FALSE (booléen)" })}</div></div>
        </div>
      </div>
    </ModalContainer>
  );
}
