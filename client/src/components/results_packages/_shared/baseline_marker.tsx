import { t3 } from "lib";
import { Badge, Button } from "panther";

// A value in the module-defaults editor that differs from the country's
// frozen baseline: a badge, what the baseline holds, and a reset back to it.
export function BaselineMarker(p: {
  baselineText: string;
  onReset: () => void;
}) {
  const resetLabel = () =>
    t3({
      en: "Reset to baseline",
      fr: "Réinitialiser à la référence",
      pt: "Repor a referência",
    });
  return (
    <div class="ui-gap-sm flex flex-wrap items-center">
      <Badge intent="warning">
        {t3({
          en: "Changed from baseline",
          fr: "Modifié par rapport à la référence",
          pt: "Alterado em relação à referência",
        })}
      </Badge>
      <span class="text-base-content-muted text-xs">
        {t3({ en: "Baseline", fr: "Référence", pt: "Referência" })}:{" "}
        {p.baselineText}
      </span>
      <Button
        ghost
        size="sm"
        iconName="refresh"
        ariaLabel={resetLabel()}
        onClick={p.onReset}
      />
    </div>
  );
}
