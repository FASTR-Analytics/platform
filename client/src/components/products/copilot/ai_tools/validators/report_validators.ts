import {
  buildReportEmbedToken,
  type FigureBlock,
  findReportEmbeds,
  type ImageBlock,
  listFastrContainerDefects,
  listFastrLiteralBackgrounds,
  listFastrNestedStats,
} from "lib";
import { AIToolFailure } from "panther";

const HTML_TOKEN_RE = /<img\b[^>]*\bsrc\s*=\s*["']?(figure|image):/i;

// Every figure:/image: token in the body must be in the report's format and
// resolve in the registry — the AI may only reference existing embed ids (it
// does not create figures here). Throws (the AI tool surfaces the message) so a
// broken token is never staged.
export function validateReportTokensResolve(
  body: string,
  figures: Record<string, FigureBlock>,
  images: Record<string, ImageBlock>,
): void {
  const wrong = HTML_TOKEN_RE.exec(body);
  if (wrong) {
    const example = buildReportEmbedToken("figure", "<id>", "caption");
    throw new AIToolFailure(
      `This report's body is FASTR MARKDOWN, but the edit contains a HTML embed token ("${
        wrong[0].slice(0, 60)
      }"). Write embed tokens as ${example} (one per line).`,
    );
  }
  const unresolved: string[] = [];
  for (const ref of findReportEmbeds(body)) {
    if (ref.kind === "figure" && !figures[ref.id]) {
      unresolved.push(`figure:${ref.id}`);
    }
    if (ref.kind === "image" && !images[ref.id]) {
      unresolved.push(`image:${ref.id}`);
    }
  }
  if (unresolved.length > 0) {
    throw new AIToolFailure(
      `Unresolved embed token(s): ${
        unresolved.join(", ")
      }. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.`,
    );
  }
}

const MAX_BODY_LENGTH = 200_000;

export function validateReportBodyLength(body: string): void {
  if (body.length > MAX_BODY_LENGTH) {
    throw new AIToolFailure(
      `Report body is too long (${body.length} chars; max ${MAX_BODY_LENGTH}).`,
    );
  }
}

// FASTR Markdown: an unbalanced or misspelt `:::` fence renders as a block
// that swallows the rest of the document (an unclosed container runs to EOF),
// so it is caught before staging rather than shown to the user as a diff.
export function validateFastrContainers(body: string): void {
  const defects = listFastrContainerDefects(body);
  if (defects.length === 0) return;
  const shown = defects
    .slice(0, 5)
    .map((d) => `line ${d.line}: ${d.message}`)
    .join("\n");
  throw new AIToolFailure(
    `The proposed body has ${defects.length} block problem${
      defects.length === 1 ? "" : "s"
    }:\n${shown}\nEvery \`:::\` block except \`stat\`, \`contents\` and \`report\` must be closed by a bare \`:::\` line, and block names must be ones the format defines. Fix and re-propose.`,
  );
}

// FASTR Markdown: literal colours — `bg=` on a block, `color=`/`highlight=`
// on a phrase — deliberately do not follow a theme switch, and the model
// reaches for them despite the brief saying tones and roles
// (observed on testing: an AI-drafted report full of hex backgrounds). Gated
// on the DELTA — literals whose value already appears in the current body were
// sanctioned by the user (set manually or previously accepted) and pass, so a
// rewrite never trips over the document's own history. The escape hatch is a
// deliberate input: the model re-proposes with allowLiteralColors: true only
// when the user actually asked for those exact colours.
export function validateFastrNewLiteralBackgrounds(
  newBody: string,
  baseBody: string,
  allowLiteralColors: boolean | undefined,
): void {
  if (allowLiteralColors) return;
  const sanctioned = new Set(
    listFastrLiteralBackgrounds(baseBody).map((l) => l.value),
  );
  const added = listFastrLiteralBackgrounds(newBody).filter(
    (l) => !sanctioned.has(l.value),
  );
  if (added.length === 0) return;
  const shown = added
    .slice(0, 5)
    .map((l) => `line ${l.line}: ${l.attr}=${l.value}`)
    .join("\n");
  throw new AIToolFailure(
    `The proposal adds ${added.length} literal colour${
      added.length === 1 ? "" : "s"
    }:\n${shown}\nLiterals do not follow a theme switch — for a ground use a tone (tone=paper|ink|accent|warm|cool) and for a phrase use a role ([x]{.danger} etc.), which each theme maps to its own palette. Only if the user explicitly asked for these exact colours, re-propose unchanged with allowLiteralColors: true.`,
  );
}

// FASTR Markdown: a whole-document rewrite that uses none of the format's
// blocks is almost always the model writing plain markdown into a designed
// document (observed after the v2 move: with the chat's create_report tool
// gone, rewrite_report became the way a report is created, and the block
// guidance rode only the per-turn view instructions). The syntax and
// composition guide now rides the tool description too, and this makes the
// contract hard: a plain body is refused unless the model DECLARES it plain,
// which it does only when the user asked for a plain document. Short bodies
// (a stub, a title page) are exempt: there is nothing to design yet.
const FASTR_PLAIN_MIN_LINES = 12;

export function validateFastrRewriteUsesBlocks(
  body: string,
  plain: boolean | undefined,
): void {
  if (plain === true) return;
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < FASTR_PLAIN_MIN_LINES) return;
  const blocks = lines.filter((l) => /^:::(?!report\b)[a-z]/i.test(l.trim()));
  if (blocks.length > 0) return;
  throw new AIToolFailure(
    "This is a FASTR Markdown report and the proposed body uses none of its blocks: it is a plain run of headings and paragraphs. Build it from the format (see rewrite_report's description): open with a `:::cover`, put the headline numbers in a `:::tiles` row of `:::stat` blocks, mark the turning points with `:::band`, put caveats in a `:::callout` and next steps in `:::steps`. Re-propose with the blocks — or, ONLY if the user explicitly asked for a plain document, re-propose unchanged with plain: true.",
  );
}

// FASTR Markdown: a stat nested in a card or a column (see
// listFastrNestedStats). Checked on the SPLICED body like the container
// check, so a section rewrite cannot smuggle one in.
export function validateFastrStatPlacement(body: string): void {
  const nested = listFastrNestedStats(body);
  if (nested.length === 0) return;
  const shown = nested.slice(0, 5).map((n) =>
    `line ${n.line}: :::stat inside :::${n.parent}`
  ).join("\n");
  throw new AIToolFailure(
    `The proposed body nests ${nested.length} stat${
      nested.length === 1 ? "" : "s"
    } inside a card or column:\n${shown}\nA stat is a tile of its own: put the stats DIRECTLY in a \`:::tiles\` row as bare \`:::stat\` lines (no \`:::card\` around them). Fix and re-propose.`,
  );
}
