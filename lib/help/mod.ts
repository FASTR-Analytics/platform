import { getLanguage, t3 } from "../translate/mod.ts";
import { HELP_TARGETS } from "./help_targets.generated.ts";
import type { HelpTarget } from "./types.ts";

export type { HelpTarget } from "./types.ts";
export { HELP_TARGETS } from "./help_targets.generated.ts";
export type { HelpId } from "./help_targets.generated.ts";

export const FASTR_SITE_URL = "https://fastr-analytics.org";

export function getHelpUrl(target: HelpTarget): string {
  const base = getLanguage() === "fr" ? `${FASTR_SITE_URL}/fr` : FASTR_SITE_URL;
  const anchor = t3(target.anchor);
  return `${base}/${target.page}/${anchor ? `#${anchor}` : ""}`;
}

export function getHelpTarget(id: keyof typeof HELP_TARGETS): HelpTarget {
  return HELP_TARGETS[id];
}
