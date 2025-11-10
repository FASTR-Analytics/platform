import { AlertComponentProps, Button, capitalizeFirstLetter } from "panther";
import { t } from "lib";

export function ConfirmUpdate(
  p: AlertComponentProps<
    {
      thingLabel: "visualization" | "report item";
    },
    boolean
  >,
) {
  return (
    <div class="ui-pad ui-spy-sm">
      <div class="font-700">{capitalizeFirstLetter(p.thingLabel)} updated</div>
      <div class="max-w-[400px]">
        {p.thingLabel === "report item"
          ? t(
              "This report has been updated by another user. Do you want to cancel your edits and see the new version?",
            )
          : t(
              "This visualization has been updated by another user. Do you want to cancel your edits and see the new version?",
            )}
      </div>
      <div class="ui-gap-sm flex flex-col pt-2">
        <Button onClick={() => p.close(true)} iconName="refresh">
          {t("Yes, cancel edits and see new version")}
        </Button>
        <Button onClick={() => p.close(false)} intent="neutral" iconName="x">
          {t("No, keep editing")}
        </Button>
      </div>
    </div>
  );
}
