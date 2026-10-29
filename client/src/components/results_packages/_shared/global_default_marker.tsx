import { t3 } from "lib";
import { Badge, Button } from "panther";

// A module parameter in the module-defaults editor whose value differs from
// the fleet's global default: a badge, the global value, and a reset to it.
export function GlobalDefaultMarker(p: {
  globalText: string;
  onReset: () => void;
}) {
  return (
    <div class="ui-gap-sm flex flex-wrap items-center">
      <Badge intent="warning">
        {t3({
          en: "Differs from global default",
          fr: "Diffère de la valeur par défaut globale",
          pt: "Difere da predefinição global",
        })}
      </Badge>
      <span class="text-base-content-muted text-xs">
        {t3({
          en: "Global default",
          fr: "Valeur par défaut globale",
          pt: "Predefinição global",
        })}: {p.globalText}
      </span>
      <Button
        ghost
        size="sm"
        iconName="refresh"
        ariaLabel={t3({
          en: "Reset to global default",
          fr: "Réinitialiser à la valeur par défaut globale",
          pt: "Repor a predefinição global",
        })}
        onClick={p.onReset}
      />
    </div>
  );
}
