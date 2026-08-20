import {
  buildReportEmbedToken,
  type FigureBlock,
  findReportEmbeds,
  type ImageBlock,
  newHtmlDefect,
  type ReportFormat,
  type ReportHtmlStyle,
  validateHtmlFragment,
} from "lib";
import { AIToolFailure } from "panther";

const MD_TOKEN_RE = /!\[[^\]]*\]\((figure|image):([^)\s]+)\)/;
const HTML_TOKEN_RE = /<img\b[^>]*\bsrc\s*=\s*["']?(figure|image):/i;

// Every figure:/image: token in the body must be in the report's format and
// resolve in the registry — the AI may only reference existing embed ids (it
// does not create figures here). Throws (the AI tool surfaces the message) so a
// broken token is never staged.
export function validateReportTokensResolve(
  body: string,
  figures: Record<string, FigureBlock>,
  images: Record<string, ImageBlock>,
  format: ReportFormat,
): void {
  const wrong = format === "html"
    ? MD_TOKEN_RE.exec(body)
    : HTML_TOKEN_RE.exec(body);
  if (wrong) {
    const example = buildReportEmbedToken(format, "figure", "<id>", "caption");
    throw new AIToolFailure(
      `This report's body is ${format.toUpperCase()}, but the edit contains a ${
        format === "html" ? "markdown" : "HTML"
      } embed token ("${wrong[0].slice(0, 60)}"). Write embed tokens as ${example} (one per line).`,
    );
  }
  const unresolved: string[] = [];
  for (const ref of findReportEmbeds(body, format)) {
    if (ref.kind === "figure" && !figures[ref.id]) unresolved.push(`figure:${ref.id}`);
    if (ref.kind === "image" && !images[ref.id]) unresolved.push(`image:${ref.id}`);
  }
  if (unresolved.length > 0) {
    throw new AIToolFailure(
      `Unresolved embed token(s): ${unresolved.join(", ")}. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.`,
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

// A self-contained html fragment/body (rewrite_report's body, rewrite_section's
// newBody): body-only markup, well-formed. No-op for markdown.
export function validateReportBodyForFormat(
  body: string,
  format: ReportFormat,
): void {
  if (format !== "html") return;
  if (/<script\b/i.test(body)) {
    throw new AIToolFailure(
      "Scripts are not allowed in report HTML (they are stripped on render) — remove the <script> block.",
    );
  }
  if (/<!doctype\b|<html\b|<head\b|<body\b/i.test(body)) {
    throw new AIToolFailure(
      "Write BODY-ONLY markup: no <!DOCTYPE>, <html>, <head> or <body> tags. Put any <style> block directly in the body.",
    );
  }
  const defect = validateHtmlFragment(body);
  if (defect) {
    throw new AIToolFailure(
      `${defect}. Close every element (</div>, </p>, </section> …) and re-propose.`,
    );
  }
}

// Backstop for the styled presets (rewrite_report only): the design brief
// rides the view instructions, but a prompt alone gets under-weighted against
// the user's content ask — observed on testing: default and editorial reports
// came out near-identical. A whole-body rewrite of a styled report without a
// real stylesheet is therefore rejected, so the model self-corrects instead
// of shipping a plain document.
const MIN_STYLED_CSS_CHARS = 400;

export function validateStyledReportHasStylesheet(
  body: string,
  format: ReportFormat,
  htmlStyle: ReportHtmlStyle | undefined,
): void {
  if (format !== "html" || !htmlStyle || htmlStyle === "default") return;
  const m = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/i.exec(body);
  const css = m?.[1]?.trim() ?? "";
  if (css.length >= MIN_STYLED_CSS_CHARS) return;
  throw new AIToolFailure(
    `This report's style is "${htmlStyle.toUpperCase()}": a full-body rewrite must be a fully designed page — a complete <style> block implementing the Design brief in your instructions, plus the markup that uses it. The proposed body has ${
      css.length === 0 ? "no <style> block" : `only ${css.length} chars of CSS`
    }. Re-propose with the full design. (Only if the user EXPLICITLY asked for an unstyled document, tell them this report was created with the "${htmlStyle}" style and suggest a Platform-default report instead.)`,
  );
}

// An in-place text edit (replace_text) may legitimately span tag boundaries, so
// the FRAGMENT can't be validated — the resulting body must simply not be worse
// than before (a body the user wrote may already carry defects).
export function validateReportBodyDelta(
  before: string,
  after: string,
  format: ReportFormat,
): void {
  if (format !== "html") return;
  if (/<script\b/i.test(after) && !/<script\b/i.test(before)) {
    throw new AIToolFailure(
      "Scripts are not allowed in report HTML (they are stripped on render) — remove the <script> block.",
    );
  }
  const added = newHtmlDefect(before, after);
  if (added) {
    throw new AIToolFailure(
      `The edit leaves the HTML less well-formed than before: ${added}. Check that every tag you open is closed and every close tag you add has an open tag.`,
    );
  }
}
