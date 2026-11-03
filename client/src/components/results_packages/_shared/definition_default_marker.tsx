import { t3 } from "lib";
import { Badge, Button } from "panther";

// A module parameter in the module-defaults editor whose value differs from
// its definition default (the module's own defaultValue): a badge, the
// default, and a reset to it.
export function DefinitionDefaultMarker(p: {
  defaultText: string;
  onReset: () => void;
}) {
  return (
    <div class="ui-gap-sm flex flex-wrap items-center">
      <Badge intent="warning">
        {t3({
          en: "Differs from default",
          fr: "Diffère de la valeur par défaut",
          pt: "Difere da predefinição",
        })}
      </Badge>
      <span class="text-base-content-muted text-xs">
        {t3({ en: "Default", fr: "Par défaut", pt: "Predefinição" })}:{" "}
        {p.defaultText}
      </span>
      <Button
        ghost
        size="sm"
        iconName="refresh"
        ariaLabel={t3({
          en: "Reset to default",
          fr: "Réinitialiser à la valeur par défaut",
          pt: "Repor a predefinição",
        })}
        onClick={p.onReset}
      />
    </div>
  );
}
