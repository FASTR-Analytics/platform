import { t3, type IcehUploadAttemptStatus } from "lib";

type Props = {
  status: Extract<IcehUploadAttemptStatus, { status: "integrating" }>;
};

export function ProgressIntegrating(p: Props) {
  return (
    <div class="ui-pad">
      <h3 class="font-700 text-lg mb-4">
        {t3({ en: "Integrating Data", fr: "Intégration des données", pt: "Integração dos dados" })}
      </h3>

      <div class="mb-4">
        <div class="bg-neutral-light h-4 w-full overflow-hidden rounded">
          <div
            class="bg-success h-full transition-all duration-300"
            style={{ width: `${p.status.progress}%` }}
          />
        </div>
        <p class="text-base-content-muted mt-1 text-sm">{p.status.progress}%</p>
      </div>

      <p class="text-base-content-muted">
        {t3({
          en: "Writing data to database... Please wait.",
          fr: "Écriture des données dans la base... Veuillez patienter.",
          pt: "A escrever os dados na base de dados... Aguarde, por favor.",
        })}
      </p>
    </div>
  );
}
