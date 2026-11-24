import type { PageOverflowCause } from "@timroberton/panther";

// Each logo row a page can name, by the deck setting that picks its logos.
const LOGO_ROWS: Record<string, string> = {
  coverLogos: "the cover's logos (logos.cover)",
  headerLogos: "the header's logos (logos.header)",
  footerLogos: "the footer's logos (logos.footer)",
};

function listed(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// A text wraps, so only its longest word can be too wide.
function partName(
  id: string,
  axis: PageOverflowCause["axis"],
  slideFieldOf: (primitiveId: string) => string | undefined,
): string {
  const logos = LOGO_ROWS[id];
  if (logos !== undefined) return logos;
  const field = slideFieldOf(id) ?? id;
  return axis === "width" ? `the longest word of ${field}` : field;
}

function clause(
  cause: PageOverflowCause,
  slideFieldOf: (primitiveId: string) => string | undefined,
): string {
  // Only a content area of negative width names the layout's root, which is
  // no block: its one cause stands in for every block it leaves short.
  if (
    cause.where === "layout" && cause.axis === "width" && cause.available < 0
  ) {
    return "the slide's margins leave its content area no width";
  }
  const ids = cause.neededBy.map((n) => n.id);
  const names = cause.where === "layout"
    ? `${ids.length === 1 ? "block" : "blocks"} ${listed(ids)}`
    : listed(ids.map((id) => partName(id, cause.axis, slideFieldOf)));
  const [holder, within] = cause.where === "layout"
    ? [cause.axis === "height" ? "the slide's content area" : "its column", ""]
    : cause.where === "stack"
    ? ["the slide", " inside its margins"]
    : [`the ${cause.where}`, ""];
  const subject = `${names} ${ids.length === 1 ? "needs" : "need"}`;
  if (cause.available <= 0) {
    return `${subject} ${cause.axis}, and ${holder} has none${within}`;
  }
  const more = Math.ceil(
    ((cause.need - cause.available) / cause.available) * 100,
  );
  return `${subject} ${more}% more ${cause.axis} than ${holder} has${within}`;
}

// What the model is told of a slide that overflows its page, after
// "OVERFLOWS THE PAGE.": one clause per overflow cause, naming what makes up
// its need in the words the model writes with (blocks by id, a cover's, a
// section's, a header's or a footer's texts by the slide field
// `slideFieldOf` maps their primitive id to, logo rows by their deck
// setting), the axis, and how much more it needs than it has as a share of
// what it has, since the model is never told the page's units.
export function describeSlideOverflowForAI(
  causes: readonly PageOverflowCause[],
  slideFieldOf: (primitiveId: string) => string | undefined,
): string {
  return `Its content does not fit: ${
    causes.map((c) => clause(c, slideFieldOf)).join("; ")
  }. Part of it is squeezed below the size it needs, or runs into the slide's margins, past the edge of the page or over other content. The slide is broken until it fits.`;
}
