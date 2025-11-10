import { type HfaIndicator, t, t2, T } from "lib";
import { AlertComponentProps, Button, Input, TextArea } from "panther";
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
    <div class="ui-pad ui-spy-sm min-w-[1000px] max-w-[1200px]">
      <h2 class="mb-4 text-lg font-700">{t("Edit Indicator")}</h2>

      <div class="ui-gap grid grid-cols-1 lg:grid-cols-2">
        <div class="ui-spy-sm">
          <Input
            label={t("Category")}
            value={tempIndicator.category}
            onChange={(v) => setTempIndicator("category", v)}
            fullWidth
          />

          <Input
            label={t("Variable Name")}
            value={tempIndicator.varName}
            onChange={(v) => setTempIndicator("varName", v)}
            fullWidth
          />

          <div class="ui-spy-sm">
            <label class="block text-sm font-medium text-gray-700 mb-1">
              {t("Valid QIDs")}
            </label>
            <TextArea
              value={tempIndicator.validQIDs.join(", ")}
              onChange={(v) => setTempIndicator("validQIDs", v.split(", ").filter(Boolean))}
              fullWidth
              height="80px"
              placeholder="Enter QIDs separated by commas"
            />
          </div>
        </div>

        <div class="ui-spy-sm">
          <TextArea
            label={t("Definition")}
            value={tempIndicator.definition}
            onChange={(v) => setTempIndicator("definition", v)}
            fullWidth
            height="120px"
          />

          <TextArea
            label={t("R Code")}
            value={tempIndicator.rCode}
            onChange={(v) => setTempIndicator("rCode", v)}
            fullWidth
            height="150px"
          />
        </div>
      </div>

      <div class="ui-gap-sm flex pt-4">
        <Button
          onClick={() => p.close("NEEDS_UPDATE")}
          iconName="save"
          intent="success"
        >
          {t2(T.FRENCH_UI_STRINGS.save)}
        </Button>
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t2(T.FRENCH_UI_STRINGS.cancel)}
        </Button>
      </div>
    </div>
  );
}
