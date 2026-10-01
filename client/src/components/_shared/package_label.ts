import { type FigureScope, t3, WHOLE_PACKAGE_DEFINITION_HASH } from "lib";
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

export function wholePackageLabel(): string {
  return t3({
    en: "Whole package",
    fr: "Paquet entier",
    pt: "Pacote inteiro",
  });
}

// A scope by LABEL, from instance T1. A null id is the whole package.
export function scopeLabel(scopeId: string | null): string {
  if (scopeId === null) return wholePackageLabel();
  return instanceState.scopes.find((s) => s.id === scopeId)?.label ??
    t3({
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
  if (match) return match.label;
  if (stamp.definitionHash === WHOLE_PACKAGE_DEFINITION_HASH) {
    return wholePackageLabel();
  }
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
  scopeId: string;
}): string {
  return `${packageLabel(product.runId)} · ${scopeLabel(product.scopeId)}`;
}
