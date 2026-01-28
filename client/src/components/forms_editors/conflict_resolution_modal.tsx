import { AlertComponentProps, Button } from "panther";
import { t } from "lib";

export function ConflictResolutionModal(
  p: AlertComponentProps<{}, "view_theirs" | "overwrite" | "cancel">
) {
  return (
    <div class="ui-pad ui-spy-sm">
      <div class="font-700">Conflict Detected</div>
      <div class="max-w-[400px]">
        {t("Someone else saved changes while you were editing.")}
      </div>
      <div class="ui-gap-sm flex flex-col pt-2">
        <Button onClick={() => p.close("overwrite")} intent="danger">
          {t("Save anyway (overwrite their changes)")}
        </Button>
        <Button onClick={() => p.close("view_theirs")} intent="neutral">
          {t("Discard my changes and close")}
        </Button>
        <Button onClick={() => p.close("cancel")} intent="neutral" outline>
          {t("Keep editing")}
        </Button>
      </div>
    </div>
  );
}
