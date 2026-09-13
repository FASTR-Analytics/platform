import { t3 } from "lib";

// The Special badge: shown beside an id the module scripts read by name, in
// the manager's list and live in the editor as the id is typed.
export function SpecialBadge() {
  return (
    <span
      class="bg-primary-subtle text-primary-subtle-content rounded px-2 py-0.5 text-xs"
      title={t3({
        en: "Read by name by the analysis modules and always analysed; must stay Uploaded, a DHIS2 element or a Sum",
        fr: "Lu par son identifiant par les modules d'analyse et toujours analysé ; doit rester téléversé, un élément DHIS2 ou une somme",
        pt: "Lido pelo seu ID pelos módulos de análise e sempre analisado; tem de permanecer carregado, um elemento DHIS2 ou uma soma",
      })}
    >
      {t3({ en: "Special", fr: "Spécial", pt: "Especial" })}
    </span>
  );
}
