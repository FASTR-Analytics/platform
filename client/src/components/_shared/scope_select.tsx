import { ALL_DATA_SCOPE_ID, type Scope, type ScopeId, t3 } from "lib";
import { Select } from "panther";
import { untrack } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { scopeDisplayLabel } from "./package_label.ts";

type Props = {
  // undefined = nothing chosen yet.
  scopeId: ScopeId | undefined;
  onChange: (scopeId: ScopeId) => void;
  label?: string;
  size?: "sm";
  fullWidth?: boolean;
  // Every scope the connection can read under, not only the ones it may put
  // a product on (Explore reads; it attaches nothing).
  anyScope?: boolean;
};

// The scopes a user may put a product on. A global admin picks any; a
// restricted user its granted ones, which is all instanceState.scopes holds
// for it; any other user holds "All data" and is offered that alone. `keep`
// (a product's current scope) stays listed so the picker still shows it.
export function pickableScopes(keep: ScopeId | undefined): Scope[] {
  if (
    instanceState.currentUserIsGlobalAdmin ||
    !instanceState.currentUserScopeAccess.all
  ) {
    return instanceState.scopes;
  }
  return instanceState.scopes.filter((s) =>
    s.id === ALL_DATA_SCOPE_ID || s.id === keep
  );
}

// Scopes are picked by label, "All data" first (the order the scopes list
// arrives in). The author never sets a scope's dimensions: those are edited
// by a global admin on the Scopes page, opened from Results.
export function ScopeSelect(p: Props) {
  const keep = untrack(() => p.scopeId);
  const scopes = () => p.anyScope ? instanceState.scopes : pickableScopes(keep);
  return (
    <Select
      label={p.label}
      value={p.scopeId}
      options={scopes().map((s) => ({
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
