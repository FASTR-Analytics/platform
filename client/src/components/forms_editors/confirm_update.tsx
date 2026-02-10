import { AlertComponentProps, Button, capitalizeFirstLetter, ModalContainer } from "panther";
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
    <ModalContainer title={`${capitalizeFirstLetter(p.thingLabel)} updated`} width="sm">
      <div>
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
    </ModalContainer>
  );
}
