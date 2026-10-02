import {
  ALL_DATA_SCOPE_ID,
  type FigureScope,
  type Scope,
  type ScopeId,
  t3,
  TC,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";

// The package a product serves from, by LABEL. Ready-package labels are
// approved-user data and ride the instance channel for exactly this (D8); a
// product attached to a package that has left the ready list still shows
// something honest rather than a blank. The catalogue is the second source
// for data-configuring users, who see packages that are not ready.
export function packageLabel(runId: string): string {
  const ready = instanceState.readyPackages.find((r) => r.id === runId);
  if (ready) return ready.label;
  const catalogued = instanceState.runsCatalog.find((r) => r.id === runId);
  if (catalogued) return catalogued.label;
  return t3({
    en: "Unlisted package",
    fr: "Paquet non répertorié",
    pt: "Pacote não listado",
  });
}

// The label a scope is shown under. The reserved scope's stored label is
// English, so it is shown translated; every other label is the admin's own.
export function scopeDisplayLabel(scope: Pick<Scope, "id" | "label">): string {
  return scope.id === ALL_DATA_SCOPE_ID ? t3(TC.allData) : scope.label;
}

// A scope by LABEL, from instance T1.
export function scopeLabel(scopeId: ScopeId): string {
  const scope = instanceState.scopes.find((s) => s.id === scopeId);
  return scope !== undefined ? scopeDisplayLabel(scope) : t3({
    en: "Unlisted scope",
    fr: "Portée non répertoriée",
    pt: "Âmbito não listado",
  });
}

// What a stored figure says it was resolved under. A bundle records the hash
// of the definition, not the scope's id, so the label is that of a scope
// whose definition still hashes the same; a definition edited since has none,
// and the area it carried is the most that can be said.
export function figureScopeLabel(stamp: FigureScope): string {
  const match = instanceState.scopes.find(
    (s) => s.definitionHash === stamp.definitionHash,
  );
  if (match) return scopeDisplayLabel(match);
  return stamp.adminArea2 ??
    t3({
      en: "An earlier scope definition",
      fr: "Une définition de portée antérieure",
      pt: "Uma definição de âmbito anterior",
    });
}

// The "package · scope" caption every product surface shows (cards, list
// rows, editor headers).
export function packageScopeCaption(product: {
  runId: string;
  scopeId: ScopeId;
}): string {
  return `${packageLabel(product.runId)} · ${scopeLabel(product.scopeId)}`;
}
