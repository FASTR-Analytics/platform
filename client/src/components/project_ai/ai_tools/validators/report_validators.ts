import {
  buildReportEmbedToken,
  type FigureBlock,
  findReportEmbeds,
  type ImageBlock,
  newHtmlDefect,
  type ReportFormat,
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
  // Preset name or custom style label; undefined = unstyled (default).
  styleName: string | undefined,
): void {
  if (format !== "html" || !styleName) return;
  const m = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/i.exec(body);
  const css = m?.[1]?.trim() ?? "";
  if (css.length >= MIN_STYLED_CSS_CHARS) return;
  throw new AIToolFailure(
    `This report's style is "${styleName.toUpperCase()}": a full-body rewrite must be a fully designed page — a complete <style> block implementing the Design brief in your instructions, plus the markup that uses it. The proposed body has ${
      css.length === 0 ? "no <style> block" : `only ${css.length} chars of CSS`
    }. Re-propose with the full design. (Only if the user EXPLICITLY asked for an unstyled document, tell them this report was created with the "${styleName}" style and suggest a Platform-default report instead.)`,
  );
}

// Backstop for custom styles that carry a reference stylesheet. The
// instruction is "include the stylesheet essentially verbatim" — so when the
// sheet IS included, all of its class names appear in the body (inside the
// <style> block if nowhere else) and this passes trivially. Requiring a HIGH
// fraction therefore effectively enforces inclusion: observed live, a body
// sharing only one incidental name ("eyebrow") while inventing a whole new
// design must be rejected.
export function validateReferenceCssReuse(
  body: string,
  format: ReportFormat,
  referenceCss: string | null | undefined,
  styleName: string | undefined,
): void {
  if (format !== "html" || !referenceCss?.trim() || !styleName) return;
  const classNames = new Set<string>();
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(referenceCss)) !== null) classNames.add(m[1]);
  if (classNames.size === 0) return;
  const present = [...classNames].filter((name) => body.includes(name));
  const required = Math.max(1, Math.ceil(classNames.size * 0.7));
  if (present.length < required) {
    const missing = [...classNames]
      .filter((name) => !body.includes(name))
      .slice(0, 10)
      .join(", ");
    throw new AIToolFailure(
      `This report's style "${styleName}" carries a reference stylesheet, but the proposed body only uses ${present.length} of its ${classNames.size} class names — it looks like you wrote a NEW design instead of reusing the stylesheet (missing e.g.: ${missing}). COPY the reference stylesheet into your <style> block first (essentially verbatim), then write markup using ITS classes — including the wrapper element if the rules are scoped under one (a body-wrapping element carrying that class). Do not rename its classes or invent a parallel design.`,
    );
  }

  // Inclusion is not application (observed live: the sheet shipped verbatim
  // inside <style>, satisfying the name check, while the MARKUP used none of
  // it — and with a wrapper-scoped sheet that renders as a completely foreign
  // design). Check the markup with the style blocks stripped.
  const markup = body.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");

  // Dominant scoping wrapper: the leading class shared by most rule preludes.
  const preludeCounts = new Map<string, number>();
  let preludes = 0;
  for (const rule of referenceCss.split("}")) {
    const prelude = rule.split("{")[0];
    const lm = /^\s*\.([A-Za-z_][\w-]*)/.exec(prelude);
    if (!lm) continue;
    preludes++;
    preludeCounts.set(lm[1], (preludeCounts.get(lm[1]) ?? 0) + 1);
  }
  const dominant = [...preludeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (dominant && preludes >= 3 && dominant[1] / preludes >= 0.6) {
    const wrapper = dominant[0];
    const esc = wrapper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const carriesWrapper = new RegExp(
      `class\\s*=\\s*["'][^"']*\\b${esc}\\b`,
    );
    if (!carriesWrapper.test(markup)) {
      throw new AIToolFailure(
        `The reference stylesheet for style "${styleName}" scopes its rules under ".${wrapper}" — every selector needs an ancestor with that class, so WITHOUT a wrapping element the whole stylesheet does nothing and the report renders in a different design. Wrap the ENTIRE body content (after the <style> block) in an element with class="${wrapper}" and keep your markup inside it.`,
      );
    }
  }

  // And the markup must actually USE a reasonable share of the classes —
  // shipping the stylesheet while styling nothing with it is the same failure.
  const usedInMarkup = [...classNames].filter((name) => markup.includes(name));
  const requiredInMarkup = Math.min(
    classNames.size,
    Math.max(2, Math.ceil(classNames.size * 0.25)),
  );
  if (usedInMarkup.length < requiredInMarkup) {
    const unused = [...classNames]
      .filter((name) => !markup.includes(name))
      .slice(0, 10)
      .join(", ");
    throw new AIToolFailure(
      `The reference stylesheet for style "${styleName}" is included, but the MARKUP barely uses its classes (${usedInMarkup.length} of ${classNames.size}; unused e.g.: ${unused}). Write the report's elements WITH these classes (eyebrow/heading/panel/list/figure treatments as the stylesheet defines them) instead of unclassed or differently-named markup — otherwise the design does not apply.`,
    );
  }
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
