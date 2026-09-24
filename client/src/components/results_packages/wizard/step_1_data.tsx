import { t3, type DatasetType, type RunGenerationStep1Result } from "lib";
import { Checkbox } from "panther";
import { For, Show } from "solid-js";

export type FamilyBlockedReason = "no_data" | "hmis_import_running";

type Props = {
  families: RunGenerationStep1Result;
  blocked: (family: DatasetType) => FamilyBlockedReason | undefined;
  setFamily: (family: DatasetType, included: boolean) => void;
};

// Step 1: choose data: plain family-inclusion checkboxes. Generation always
// captures the FULL dataset per family (PLAN_FULL_CAPTURE_GENERATION);
// a product narrows by its scope at read time, never here.
export function StepData(p: Props) {
  const blockedNote: Record<FamilyBlockedReason, string> = {
    no_data: t3({
      en: "No data of this type has been uploaded to this instance",
      fr: "Aucune donnée de ce type n'a été téléversée sur cette instance",
      pt: "Nenhum dado deste tipo foi carregado nesta instância",
    }),
    hmis_import_running: t3({
      en: "A DHIS2 import run is in progress. Wait for it to complete or cancel it.",
      fr: "Une importation DHIS2 est en cours. Attendez qu'elle se termine ou annulez-la.",
      pt: "Uma importação DHIS2 está em curso. Aguarde a sua conclusão ou cancele-a.",
    }),
  };

  const rows: { family: DatasetType; label: string }[] = [
    {
      family: "hmis",
      label: t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" }),
    },
    {
      family: "hfa",
      label: t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" }),
    },
    {
      family: "iceh",
      label: t3({
        en: "ICEH equity data",
        fr: "Données d'équité ICEH",
        pt: "Dados de equidade ICEH",
      }),
    },
  ];

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <h3 class="ui-text-heading">
          {t3({
            en: "Choose data",
            fr: "Choisir les données",
            pt: "Escolher os dados",
          })}
        </h3>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "Choose which data families this results package is generated from. Each included family is captured in full.",
            fr: "Choisissez les familles de données à partir desquelles ce paquet de résultats est généré. Chaque famille incluse est capturée dans son intégralité.",
            pt: "Escolha as famílias de dados a partir das quais este pacote de resultados é gerado. Cada família incluída é capturada na íntegra.",
          })}
        </div>
      </div>
      <div class="ui-spy-sm">
        <For each={rows}>
          {(row) => (
            <Checkbox
              label={
                <span>
                  <span>{row.label}</span>
                  <Show when={p.blocked(row.family)}>
                    {(reason) => (
                      <span class="text-base-content-muted ml-2">
                        {blockedNote[reason()]}
                      </span>
                    )}
                  </Show>
                </span>
              }
              checked={p.families[row.family]}
              onChange={(v) => p.setFamily(row.family, v)}
              disabled={p.blocked(row.family) !== undefined}
            />
          )}
        </For>
      </div>
    </div>
  );
}
