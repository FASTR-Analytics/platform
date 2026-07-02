import { type DatasetHfaUploadAttemptStatus, t3 } from "lib";
import { to100Pct0 } from "panther";
import { ProgressBar } from "panther";

export function ProgressIntegrating(p: {
  status: Extract<DatasetHfaUploadAttemptStatus, { status: "integrating" }>;
}) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({ en: "Integrating data...", fr: "Intégration des données..." })} {to100Pct0(p.status.progress)}
      </div>
      <ProgressBar progressFrom0To100={p.status.progress} />
    </div>
  );
}
