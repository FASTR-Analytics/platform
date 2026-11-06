import { type ScopeId, t3 } from "lib";
import { Select } from "panther";
import { instanceState } from "~/state/instance/t1_store";
import { scopeDisplayLabel } from "./package_label.ts";

type Props = {
  // undefined = nothing chosen yet.
  scopeId: ScopeId | undefined;
  onChange: (scopeId: ScopeId) => void;
  label?: string;
  size?: "sm";
  fullWidth?: boolean;
};

// Scopes are picked by label, "All data" first (the order the scopes list
// arrives in), from the scopes the connection holds: every scope for an
// unrestricted user, the granted ones for a restricted user, which is all
// instanceState.scopes holds for it. A scope's dimensions are never set
// here: an unrestricted user edits them on the Scopes page.
export function ScopeSelect(p: Props) {
  return (
    <Select
      label={p.label}
      value={p.scopeId}
      options={instanceState.scopes.map((s) => ({
        value: s.id,
        label: scopeDisplayLabel(s),
      }))}
      onChange={p.onChange}
      placeholder={t3({
        en: "Select a scope",
        fr: "Sélectionner une portée",
        pt: "Selecionar um âmbito",
      })}
      size={p.size}
      fullWidth={p.fullWidth}
    />
  );
}

export function scopeSelectLabel(): string {
  return t3({ en: "Scope", fr: "Portée", pt: "Âmbito" });
}
