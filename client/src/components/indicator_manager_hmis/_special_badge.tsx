import { t3 } from "lib";
import { Badge } from "panther";

// The Special badge: shown beside an id the module scripts read by name, in
// the manager's list and live in the editor as the id is typed.
export function SpecialBadge() {
  return (
    <span
      title={t3({
        en: "Read by name by the analysis modules and always analysed; must stay a DHIS2 element, Uploaded or a Sum",
        fr: "Lu par son identifiant par les modules d'analyse et toujours analysé ; doit rester un élément DHIS2, téléversé ou une somme",
        pt: "Lido pelo seu ID pelos módulos de análise e sempre analisado; tem de permanecer um elemento DHIS2, carregado ou uma soma",
      })}
    >
      <Badge>{t3({ en: "Special", fr: "Spécial", pt: "Especial" })}</Badge>
    </span>
  );
}
