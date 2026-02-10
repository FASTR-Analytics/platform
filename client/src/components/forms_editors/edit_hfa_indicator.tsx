import { type HfaIndicator, t, t2, T } from "lib";
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
      title={t("Edit Indicator")}
      width="xl"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={() => p.close("NEEDS_UPDATE")}
            iconName="save"
            intent="success"
          >
            {t2(T.FRENCH_UI_STRINGS.save)}
          </Button>,
          <Button
            onClick={() => p.close(undefined)}
            intent="neutral"
            iconName="x"
          >
            {t2(T.FRENCH_UI_STRINGS.cancel)}
          </Button>,
        ]
      }
    >
      <div class="ui-gap grid grid-cols-1 lg:grid-cols-2">
        <div class="ui-spy">

          <Input
            label={t("Variable Name")}
            value={tempIndicator.varName}
            onChange={(v) => setTempIndicator("varName", v)}
            fullWidth
          />
          <Input
            label={t("Category")}
            value={tempIndicator.category}
            onChange={(v) => setTempIndicator("category", v)}
            fullWidth
          />
          <TextArea
            label={t("Definition")}
            value={tempIndicator.definition}
            onChange={(v) => setTempIndicator("definition", v)}
            fullWidth
            height="160px"
          />


        </div>

        <div class="ui-spy">

          <RadioGroup
            label={t("Type")}
            value={tempIndicator.type}
            onChange={(v) => setTempIndicator("type", v as "binary" | "numeric")}
            options={[
              { value: "binary", label: "Boolean (for percentages)" },
              { value: "numeric", label: "Numeric (for averages/sums)" },
            ]}
          />
          <div class="">
            <TextArea
              label={t("R Code")}
              value={tempIndicator.rCode}
              onChange={(v) => setTempIndicator("rCode", v)}
              fullWidth
              height="80px"
              mono
            />
            <div class="text-xs">{
              tempIndicator.type === "binary"
                ? t("Should evaluate to boolean TRUE/FALSE")
                : t("Should evaluate to a numeric value")
            }</div></div>
          <div class="text-xs">
            <TextArea
              label={t("Filter Code (should evaluate to boolean TRUE/FALSE)")}
              value={tempIndicator.rFilterCode ?? ""}
              onChange={(v) => setTempIndicator("rFilterCode", v)}
              fullWidth
              mono
              height="80px"
              placeholder="R expression to filter facilities (e.g., facility_type == 'urban')"
            />
            <div class="text-xs">{t("Should evaluate to boolean TRUE/FALSE")}</div></div>
        </div>
      </div>
    </ModalContainer>
  );
}
