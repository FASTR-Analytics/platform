import { DatasetUploadAttemptStatus, t } from "lib";
import { to100Pct0 } from "panther";
import { ProgressBar } from "panther";

export function ProgressIntegrating(p: {
  status: Extract<DatasetUploadAttemptStatus, { status: "integrating" }>;
  sourceType: "csv" | "dhis2";
}) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t("Integrating data...")} {to100Pct0(p.status.progress)}
      </div>
      <ProgressBar progressFrom0To100={p.status.progress} />
    </div>
  );
}
