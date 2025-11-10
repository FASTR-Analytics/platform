import { t } from "lib";
import { Button, type TimActionButton } from "panther";

export function ProgressComplete(p: { deleteSafe: TimActionButton<[]> }) {
  return (
    <div class="ui-spy ui-pad">
      <div class="">
        This import is complete! You should now remove the upload form.
      </div>
      <Button
        onClick={p.deleteSafe.click}
        state={p.deleteSafe.state()}
        intent="success"
        iconName="trash"
      >
        {t("Remove completed upload form")}
      </Button>
    </div>
  );
}
