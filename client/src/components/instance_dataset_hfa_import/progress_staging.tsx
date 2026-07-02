import { type DatasetHfaUploadAttemptStatus, t3 } from "lib";
import { to100Pct0 } from "panther";
import { ProgressBar } from "panther";

export function ProgressStaging(p: {
  status: Extract<DatasetHfaUploadAttemptStatus, { status: "staging" }>;
}) {
  return (
    <div class="ui-pad ui-spy">
      <div class="">
        {t3({ en: "Staging data...", fr: "Préparation des données...", pt: "A preparar os dados..." })} {to100Pct0(p.status.progress)}
      </div>
      <ProgressBar progressFrom0To100={p.status.progress} />
    </div>
  );
}
