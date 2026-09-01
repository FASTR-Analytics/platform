// Executes the report HTML sanitizer config (REPORT_PURIFY_CONFIG in
// lib/types/reports.ts) against the same DOMPurify version the client ships
// (deno.json "dompurify" pins what client/package.json ships), on a jsdom
// window. The client's sanitizeReportHtml is
// exactly DOMPurify.sanitize(html, REPORT_PURIFY_CONFIG); this pins what that
// call keeps (embed schemes, <style>, data: images, data-line/class/style/id)
// and what it strips (scripts, handlers, javascript: URLs, frames, meta/base,
// forms, link) — the properties the sandboxed preview and the un-sandboxed
// .html export both rely on.
//
// Run: deno test -A server/tests/report_html_sanitize_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { JSDOM } from "npm:jsdom@^26.1.0";
import createDOMPurify from "dompurify";
import { REPORT_PURIFY_CONFIG } from "../../lib/types/reports.ts";
import { renderFastrMarkdownToHtml } from "../../lib/report_fastr_markdown.ts";

const window = new JSDOM("").window;
const purify = createDOMPurify(window as unknown as Window & typeof globalThis);

function clean(html: string): string {
  return purify.sanitize(html, REPORT_PURIFY_CONFIG) as string;
}

const ID = "8b7c1c2e-6f2a-4a3b-9c1d-0e1f2a3b4c5d";

Deno.test("keeps a leading <style> block (FORCE_BODY) and its CSS verbatim", () => {
  const out = clean(`<style>h1 { color: red } .a > p { margin: 0 }</style><h1>T</h1>`);
  assertStringIncludes(out, `<style>h1 { color: red } .a > p { margin: 0 }</style>`);
  assertStringIncludes(out, `<h1>T</h1>`);
});

Deno.test("keeps figure:/image: embed tokens with their attributes, data-line, class/style/id", () => {
  const out = clean(
    `<p data-line="3" class="lead" style="color: teal" id="sec-intro">x</p>` +
      `<img src="figure:${ID}" alt="a &amp; b" class="wide" style="max-width:50%" id="fig1" data-line="4">` +
      `<img src='image:${ID}' alt="i">`,
  );
  assertStringIncludes(out, `src="figure:${ID}"`);
  assertStringIncludes(out, `src="image:${ID}"`);
  assertStringIncludes(out, `class="wide"`);
  assertStringIncludes(out, `style="max-width:50%"`);
  assertStringIncludes(out, `id="fig1"`);
  assertStringIncludes(out, `data-line="4"`);
  assertStringIncludes(out, `data-line="3"`);
  assertStringIncludes(out, `id="sec-intro"`);
});

Deno.test("keeps a <style> block whose first line is a Google-Fonts @import (the Editorial style's font path)", () => {
  const css =
    `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');\n` +
    `:root { --ink: #0F2130 } body { font-family: 'IBM Plex Sans', sans-serif }`;
  const out = clean(`<style>${css}</style><h1>T</h1>`);
  assertStringIncludes(out, `<style>${css}</style>`);
});

Deno.test("keeps data: images, http(s) images/links, tables, details, svg (target is dropped — the preview intercepts links anyway)", () => {
  const out = clean(
    `<img src="data:image/png;base64,iVBORw0KGgo=" alt="d">` +
      `<img src="https://example.org/x.png"><a href="https://example.org" target="_blank" rel="noopener">l</a>` +
      `<a href="#sec-results">toc</a><a href="mailto:a@b.c">m</a>` +
      `<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>` +
      `<details open><summary>s</summary>b</details>` +
      `<svg viewBox="0 0 10 10"><rect width="5" height="5"></rect></svg>`,
  );
  assertStringIncludes(out, `src="data:image/png;base64,iVBORw0KGgo="`);
  assertStringIncludes(out, `src="https://example.org/x.png"`);
  assert(!out.includes(`target=`));
  assertStringIncludes(out, `rel="noopener"`);
  assertStringIncludes(out, `href="#sec-results"`);
  assertStringIncludes(out, `href="mailto:a@b.c"`);
  assertStringIncludes(out, `<table>`);
  assertStringIncludes(out, `<details open="">`);
  assertStringIncludes(out, `<svg`);
});

Deno.test("strips scripts, handlers, javascript: URLs, frames, objects, meta/base/link, forms, title", () => {
  const out = clean(
    `<script>alert(1)</script>` +
      `<p onclick="alert(1)" onmouseover="x()">t</p>` +
      `<a href="javascript:alert(1)">j</a>` +
      `<a href="  JaVaScRiPt:alert(1)">j2</a>` +
      `<img src="x" onerror="alert(1)">` +
      `<iframe src="https://evil"></iframe>` +
      `<object data="x"></object><embed src="x">` +
      `<meta http-equiv="refresh" content="0;url=https://evil">` +
      `<base href="https://evil/">` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">` +
      `<form action="https://evil"><input name="a"><button>b</button><select><option>o</option></select><textarea>t</textarea></form>` +
      `<title>t</title><dialog open>d</dialog><template><p>tpl</p></template><marquee>m</marquee>` +
      `<svg><script>alert(1)</script><a href="javascript:alert(1)">s</a></svg>` +
      `<math><maction actiontype="statusline#http://evil">m</maction></math>`,
  );
  for (const bad of [
    "<script",
    "onclick",
    "onmouseover",
    "onerror",
    "javascript:",
    "<iframe",
    "<object",
    "<embed",
    "<meta",
    "<base",
    "<link",
    "<form",
    "<input",
    "<button",
    "<select",
    "<option",
    "<textarea",
    "<title",
    "<dialog",
    "<template",
    "<marquee",
    "alert(1)",
    "evil",
  ]) {
    assert(!out.includes(bad), `expected "${bad}" to be stripped, got: ${out}`);
  }
  // Text of a stripped-but-KEEP_CONTENT element survives (p/a stay, only the
  // attributes go).
  assertStringIncludes(out, `<p>t</p>`);
});

Deno.test("does not let a stored body clobber the document via id/name (SANITIZE_DOM stays on)", () => {
  const out = clean(`<img name="body" src="https://x/y.png"><form id="images"></form><div id="sec-images">ok</div>`);
  assert(!out.includes(`name="body"`));
  assertStringIncludes(out, `id="sec-images"`);
});

Deno.test("the ALLOWED_URI_REGEXP is DOMPurify's default plus the two embed schemes", () => {
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("figure:abc"), true);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("image:abc"), true);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("https://x"), true);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("#frag"), true);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("/relative/path"), true);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("javascript:alert(1)"), false);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("vbscript:x"), false);
  assertEquals(REPORT_PURIFY_CONFIG.ALLOWED_URI_REGEXP.test("blob:https://x/uuid"), false);
});

// FASTR Markdown compiles to markup that goes through this same sanitizer, so
// the format only works if its taxonomy classes and figure/figcaption
// structure survive — the theme stylesheet has nothing to hook onto otherwise.
Deno.test("keeps everything FASTR Markdown compiles to", () => {
  const out = clean(
    renderFastrMarkdownToHtml(
      `# Title\n\n` +
        `:::callout{kind=warning title="Caveat"}\ntext\n:::\n\n` +
        `:::tiles{cols=3}\n:::card{title="A" accent}\nx\n:::\n` +
        `:::stat{value="64%" label="ANC4" delta="+3pp" dir=up}\n:::\n\n` +
        `:::columns{cols=2}\n:::col{span=2}\n![Cap](figure:${ID})\n:::\n:::\n\n` +
        `:::quote{cite="Someone"}\nq\n:::\n`,
      { lineAnchors: true },
    ),
  );
  for (
    const cls of [
      "fm-callout fm-callout--warning",
      "fm-callout__title",
      "fm-tiles fm-tiles--3",
      "fm-card fm-card--accent",
      "fm-card__title",
      "fm-stat__value",
      "fm-stat__delta fm-stat__delta--up",
      "fm-columns fm-columns--2",
      "fm-col fm-col--span2",
      "fm-figure",
      "fm-figure__caption",
      "fm-quote",
      "fm-quote__cite",
    ]
  ) {
    assertStringIncludes(out, cls);
  }
  assertStringIncludes(out, `<blockquote class="fm-quote"`);
  assertStringIncludes(out, `src="figure:${ID}"`);
  assertStringIncludes(out, `data-line="0"`);
});

// The compiler passes raw HTML through (an escape hatch for power users); the
// sanitizer, not the compiler, is what makes that safe.
Deno.test("strips scripts that reach the sanitizer through FASTR Markdown", () => {
  const out = clean(
    renderFastrMarkdownToHtml(
      `<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n:::callout\nok\n:::\n`,
      { lineAnchors: false },
    ),
  );
  assert(!out.includes("<script"));
  assert(!out.includes("onerror"));
  assertStringIncludes(out, "fm-callout");
});

// A block attribute is TEXT: it is entity-escaped by the compiler, so markup
// written there is inert rather than sanitized away — it shows as characters.
Deno.test("markup in a FASTR block attribute is escaped, not executed", () => {
  const out = clean(
    renderFastrMarkdownToHtml(
      `:::callout{title="<img src=x onerror=alert(1)>"}\nok\n:::\n`,
      { lineAnchors: false },
    ),
  );
  assertStringIncludes(out, "&lt;img src=x onerror=alert(1)&gt;");
  assert(!/<img\b/.test(out));
});

// The literal-background escape hatch only works if the sanitizer keeps an
// inline standard declaration and the data attribute the client resolves.
Deno.test("keeps FASTR block backgrounds: inline colour and data-bg-image", () => {
  const out = clean(
    renderFastrMarkdownToHtml(
      `:::band{bg="#0b3d2e"}\ndark band\n:::\n\n` +
        `:::band{bg=image:${ID}}\nphoto band\n:::\n\n` +
        `:::band{tone=dark}\ntoned band\n:::\n`,
      { lineAnchors: false },
    ),
  );
  assertStringIncludes(out, "background-color: #0b3d2e");
  assertStringIncludes(out, `data-bg-image="image:${ID}"`);
  assertStringIncludes(out, "fm-has-bgimage");
  assertStringIncludes(out, "fm-overlay fm-overlay--dark");
  assertStringIncludes(out, "fm-ink--light");
  assertStringIncludes(out, "fm-tone fm-tone--dark");
  assertStringIncludes(out, "<section class=");
});

// Gradients are the one background html reports could paint that a tone cannot,
// so the whole feature rests on DOMPurify keeping the inline shorthand.
Deno.test("keeps a gradient background in the inline style", () => {
  const out = clean(
    renderFastrMarkdownToHtml(
      ':::band{bg="linear-gradient(180deg,#0b3d2e,#0a2a20)"}\nsweep\n:::\n\n' +
        ":::cover{tone=gradient}\n# T\n:::\n",
      { lineAnchors: false },
    ),
  );
  assertStringIncludes(out, "linear-gradient(180deg,#0b3d2e,#0a2a20)");
  assertStringIncludes(out, "fm-ink--light");
  assertStringIncludes(out, "fm-tone fm-tone--gradient");
});
