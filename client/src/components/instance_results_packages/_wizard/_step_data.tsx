import { t3, type DatasetType, type RunGenerationStep1Result } from "lib";
import { Checkbox } from "panther";
import { For, Show } from "solid-js";

type Props = {
  families: RunGenerationStep1Result;
  available: (family: DatasetType) => boolean;
  setFamily: (family: DatasetType, included: boolean) => void;
};

// Step 1 — choose data: plain family-inclusion checkboxes. Generation always
// captures the FULL dataset per family (PLAN_FULL_CAPTURE_GENERATION); a
// product's scope narrows what its figures QUERY, never what the package
// holds.
export function StepData(p: Props) {
  const notAvailableNote = t3({
    en: "No data of this type has been uploaded to this instance",
    fr: "Aucune donnée de ce type n'a été téléversée sur cette instance",
    pt: "Nenhum dado deste tipo foi carregado nesta instância",
  });

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
      <h3 class="ui-text-heading">
        {t3({ en: "Choose data", fr: "Choisir les données", pt: "Escolher os dados" })}
      </h3>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Choose which data families this results package is generated from. Each included family is captured in full.",
          fr: "Choisissez les familles de données à partir desquelles ce paquet de résultats est généré. Chaque famille incluse est capturée dans son intégralité.",
          pt: "Escolha as famílias de dados a partir das quais este pacote de resultados é gerado. Cada família incluída é capturada na íntegra.",
        })}
      </div>
      <For each={rows}>
        {(row) => (
          <div class="ui-pad ui-spy rounded border">
            <Checkbox
              label={row.label}
              checked={p.families[row.family]}
              onChange={(v) => p.setFamily(row.family, v)}
              disabled={!p.available(row.family)}
            />
            <Show when={!p.available(row.family)}>
              <div class="text-base-content-muted text-sm">{notAvailableNote}</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
