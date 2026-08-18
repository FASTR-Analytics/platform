import { getLanguage, t3 } from "../translate/mod.ts";
import { HELP_TARGETS } from "./help_targets.generated.ts";
import type { HelpTarget } from "./types.ts";

export type { HelpTarget } from "./types.ts";
export { HELP_TARGETS } from "./help_targets.generated.ts";
export type { HelpId } from "./help_targets.generated.ts";

export const FASTR_SITE_URL = "https://fastr-analytics.org";

/** Docs page URL in the reader's language (only EN and FR exist on the site). */
export function getDocsUrl(page: string): string {
  const base = getLanguage() === "fr" ? `${FASTR_SITE_URL}/fr` : FASTR_SITE_URL;
  return `${base}/${page}/`;
}

/** The "Documentation" entry point — the site overview, not the landing page. */
export function getDocsOverviewUrl(): string {
  return getDocsUrl("overview");
}

export function getHelpUrl(target: HelpTarget): string {
  const anchor = t3(target.anchor);
  return `${getDocsUrl(target.page)}${anchor ? `#${anchor}` : ""}`;
}

export function getHelpTarget(id: keyof typeof HELP_TARGETS): HelpTarget {
  return HELP_TARGETS[id];
}
