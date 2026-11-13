import type { FigureUnavailable } from "lib";

// Why a figure cannot be drawn, in English for the model: the reason
// describeFigureUnavailable gives the user in their language.
export function describeFigureUnavailableForAI(
  reason: FigureUnavailable,
): string {
  if (reason.kind === "no_area_matches") {
    return `none of its ${reason.dataAreas} data areas matches one of the ${reason.boundaries} map boundaries${
      reason.source === "package" ? " in this results package" : ""
    }.`;
  }
  const boundaries =
    `the ${reason.family.toUpperCase()} map boundaries at Admin Area ${reason.level}`;
  if (reason.kind === "boundaries_loading") {
    return `${boundaries} are still loading.`;
  }
  return reason.source === "package"
    ? `this results package was generated without ${boundaries}.`
    : `${boundaries} have not been uploaded to this instance.`;
}
