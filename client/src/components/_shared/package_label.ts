import { t3, TC } from "lib";
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

export function scopeLabel(adminArea2: string | null): string {
  return adminArea2 ?? t3(TC.national);
}

// The "package · scope" caption every product surface shows (cards, list
// rows, editor headers).
export function packageScopeCaption(product: {
  runId: string;
  adminArea2: string | null;
}): string {
  return `${packageLabel(product.runId)} · ${scopeLabel(product.adminArea2)}`;
}
