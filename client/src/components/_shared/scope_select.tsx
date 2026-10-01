import { t3 } from "lib";
import { Select } from "panther";
import { instanceState } from "~/state/instance/t1_store";
import { wholePackageLabel } from "./package_label.ts";

const WHOLE_PACKAGE = "__whole_package__";

type Props = {
  // undefined = nothing chosen yet. null = the whole package, which only a
  // surface with no product offers.
  scopeId: string | null | undefined;
  onChange: (scopeId: string | null) => void;
  allowWholePackage?: boolean;
  label?: string;
  size?: "sm";
  fullWidth?: boolean;
};

// Scopes are picked by label. The author never sets a scope's dimensions:
// those are edited by a global admin on the Scopes page, opened from Results.
export function ScopeSelect(p: Props) {
  const options = () => [
    ...(p.allowWholePackage
      ? [{ value: WHOLE_PACKAGE, label: wholePackageLabel() }]
      : []),
    ...instanceState.scopes.map((s) => ({ value: s.id, label: s.label })),
  ];
  return (
    <Select
      label={p.label}
      value={p.scopeId === null ? WHOLE_PACKAGE : p.scopeId}
      options={options()}
      onChange={(v) => p.onChange(v === WHOLE_PACKAGE ? null : v)}
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
