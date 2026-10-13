// The checks a body proposed by a model must pass before it is shown to the
// user as a diff. Each returns the message the model should read, or
// undefined when the body passes: the caller decides how a refusal travels
// (a thrown tool failure, an error result, plain text).

import { buildReportEmbedToken, findReportEmbeds } from "../engine/embeds.ts";
import {
  listFastrContainerDefects,
  listFastrLiteralBackgrounds,
  listFastrNestedStats,
} from "../engine/fastr_markdown_blocks.ts";

// The ids a body may embed: the figures and images the document has.
export type ReportEmbedIds = {
  figures: readonly string[];
  images: readonly string[];
};

const HTML_TOKEN_RE = /<img\b[^>]*\bsrc\s*=\s*["']?(figure|image):/i;

// Every figure:/image: token in the body must be in the document's format
// and name an id that exists: a model may only reference existing embeds (it
// does not create them here), so a broken token is never staged.
export function checkReportTokensResolve(
  body: string,
  embeds: ReportEmbedIds,
): string | undefined {
  const wrong = HTML_TOKEN_RE.exec(body);
  if (wrong) {
    const example = buildReportEmbedToken("figure", "<id>", "caption");
    return `This report's body is FASTR MARKDOWN, but the edit contains a HTML embed token ("${
      wrong[0].slice(0, 60)
    }"). Write embed tokens as ${example} (one per line).`;
  }
  const figures = new Set(embeds.figures);
  const images = new Set(embeds.images);
  const unresolved: string[] = [];
  for (const ref of findReportEmbeds(body)) {
    if (ref.kind === "figure" && !figures.has(ref.id)) {
      unresolved.push(`figure:${ref.id}`);
    }
    if (ref.kind === "image" && !images.has(ref.id)) {
      unresolved.push(`image:${ref.id}`);
    }
  }
  if (unresolved.length > 0) {
    return `Unresolved embed token(s): ${
      unresolved.join(", ")
    }. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.`;
  }
  return undefined;
}

export const REPORT_BODY_MAX_LENGTH = 200_000;

export function checkReportBodyLength(body: string): string | undefined {
  if (body.length > REPORT_BODY_MAX_LENGTH) {
    return `Report body is too long (${body.length} chars; max ${REPORT_BODY_MAX_LENGTH}).`;
  }
  return undefined;
}

// An unbalanced or misspelt `:::` fence renders as a block that swallows the
// rest of the document (an unclosed container runs to the end), so it is
// caught before staging rather than shown to the user as a diff. Run it on
// the whole resulting body, not on the fragment a model wrote: a locally
// balanced fragment can still unbalance the document it lands in.
export function checkFastrContainers(body: string): string | undefined {
  const defects = listFastrContainerDefects(body);
  if (defects.length === 0) return undefined;
  const shown = defects
    .slice(0, 5)
    .map((d) => `line ${d.line}: ${d.message}`)
    .join("\n");
  return `The proposed body has ${defects.length} block problem${
    defects.length === 1 ? "" : "s"
  }:\n${shown}\nEvery \`:::\` block except \`stat\`, \`contents\` and \`report\` must be closed by a bare \`:::\` line, and block names must be ones the format defines. Fix and re-propose.`;
}

// Literal colours (`bg=` on a block, `color=`/`highlight=` on a phrase)
// deliberately do not follow a theme switch, and a model reaches for them
// despite a brief that says tones and roles. The check is on the DELTA:
// literals whose value already appears in the current body were sanctioned
// by the user (set by hand or accepted earlier) and pass, so a rewrite never
// trips over the document's own history. The escape hatch is a deliberate
// input: the model re-proposes with allowLiteralColors only when the user
// asked for those exact colours.
export function checkFastrNewLiteralBackgrounds(
  newBody: string,
  baseBody: string,
  allowLiteralColors: boolean | undefined,
): string | undefined {
  if (allowLiteralColors) return undefined;
  const sanctioned = new Set(
    listFastrLiteralBackgrounds(baseBody).map((l) => l.value),
  );
  const added = listFastrLiteralBackgrounds(newBody).filter(
    (l) => !sanctioned.has(l.value),
  );
  if (added.length === 0) return undefined;
  const shown = added
    .slice(0, 5)
    .map((l) => `line ${l.line}: ${l.attr}=${l.value}`)
    .join("\n");
  return `The proposal adds ${added.length} literal colour${
    added.length === 1 ? "" : "s"
  }:\n${shown}\nLiterals do not follow a theme switch — for a ground use a tone (tone=paper|ink|accent|warm|cool) and for a phrase use a role ([x]{.danger} etc.), which each theme maps to its own palette. Only if the user explicitly asked for these exact colours, re-propose unchanged with allowLiteralColors: true.`;
}

// A whole-document rewrite that uses none of the format's blocks is almost
// always a model writing plain markdown into a designed document. A plain
// body is refused unless the model DECLARES it plain, which it does only
// when the user asked for a plain document. Short bodies (a stub, a title
// page) are exempt: there is nothing to design yet.
const FASTR_PLAIN_MIN_LINES = 12;

export function checkFastrRewriteUsesBlocks(
  body: string,
  plain: boolean | undefined,
): string | undefined {
  if (plain === true) return undefined;
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < FASTR_PLAIN_MIN_LINES) return undefined;
  const blocks = lines.filter((l) => /^:::(?!report\b)[a-z]/i.test(l.trim()));
  if (blocks.length > 0) return undefined;
  return "This is a FASTR Markdown report and the proposed body uses none of its blocks: it is a plain run of headings and paragraphs. Build it from the format (see rewrite_report's description): open with a `:::cover`, put the headline numbers in a `:::tiles` row of `:::stat` blocks, mark the turning points with `:::band`, put caveats in a `:::callout` and next steps in `:::steps`. Re-propose with the blocks — or, ONLY if the user explicitly asked for a plain document, re-propose unchanged with plain: true.";
}

// A stat nested in a card or a column (see listFastrNestedStats). Run on the
// whole resulting body like the container check, so a section rewrite cannot
// smuggle one in.
export function checkFastrStatPlacement(body: string): string | undefined {
  const nested = listFastrNestedStats(body);
  if (nested.length === 0) return undefined;
  const shown = nested.slice(0, 5).map((n) =>
    `line ${n.line}: :::stat inside :::${n.parent}`
  ).join("\n");
  return `The proposed body nests ${nested.length} stat${
    nested.length === 1 ? "" : "s"
  } inside a card or column:\n${shown}\nA stat is a tile of its own: put the stats DIRECTLY in a \`:::tiles\` row as bare \`:::stat\` lines (no \`:::card\` around them). Fix and re-propose.`;
}
