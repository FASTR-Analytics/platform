import { t3 } from "lib";
import { Select } from "panther";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  // undefined = nothing chosen yet.
  scopeId: string | undefined;
  onChange: (scopeId: string) => void;
  label?: string;
  size?: "sm";
  fullWidth?: boolean;
};

// Scopes are picked by label, "All data" first (the order the scopes list
// arrives in). The author never sets a scope's dimensions: those are edited
// by a global admin on the Scopes page, opened from Results.
export function ScopeSelect(p: Props) {
  return (
    <Select
      label={p.label}
      value={p.scopeId}
      options={instanceState.scopes.map((s) => ({
        value: s.id,
        label: s.label,
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
