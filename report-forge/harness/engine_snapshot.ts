// Engine parity snapshot: everything the engine derives from a document that
// does not need a browser. Run it against a known-good engine to write a
// baseline, then against the engine under change, and compare:
//
//   deno run -A -c deno.json report-forge/harness/engine_snapshot.ts \
//     <engine module path> <out.json>
//   deno run -A report-forge/harness/engine_compare.ts <a.json> <b.json>
//
// The corpus is every .md file under tests/fixtures plus the templates and
// block snippets, each rendered on every theme the engine lists: the
// built-ins, and whatever the module under test registered (a host's barrel
// brings the host's own themes, the engine's own entry only the built-ins).

import { Packer } from "docx";
import JSZip from "jszip";
import { dirname, fromFileUrl, join, resolve, toFileUrl } from "@std/path";

const [enginePath, outPath] = Deno.args;
if (!enginePath || !outPath) {
  console.error("usage: engine_snapshot.ts <engine module path> <out.json>");
  Deno.exit(2);
}

// deno-lint-ignore no-explicit-any
const E: any = await import(toFileUrl(resolve(enginePath)).href);

const here = dirname(fromFileUrl(import.meta.url));
const corpusDir = join(here, "..", "tests", "fixtures");

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const FOOTER = { title: "Quarterly review", pageWord: "Page", ofWord: "of" };

const bodies: { name: string; body: string }[] = [];
for await (const entry of Deno.readDir(corpusDir)) {
  if (!entry.name.endsWith(".md")) continue;
  bodies.push({
    name: entry.name.replace(/\.md$/, ""),
    body: await Deno.readTextFile(join(corpusDir, entry.name)),
  });
}
for (const template of E.fastrTemplateIds() as string[]) {
  bodies.push({
    name: `template_${template}`,
    body: E.fastrReportTemplateBody(template, "Quarterly review"),
  });
}
bodies.sort((a, b) => a.name.localeCompare(b.name));

async function wordXml(body: string, theme: string): Promise<string> {
  const tokens = E.createFastrMarkdownIt().parse(body, {});
  const doc = E.buildFastrWordDocument({
    tokens,
    body,
    title: "Quarterly review",
    theme,
    footer: FOOTER,
    figure: () =>
      E.dataUrlToWordImage(`data:image/png;base64,${PNG_1X1}`, 1920, 1080),
    image: () => undefined,
  });
  const blob = await Packer.toBlob(doc);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const parts: string[] = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    // docx stamps the build time into the core properties.
    if (name === "docProps/core.xml") continue;
    parts.push(`== ${name}\n${await zip.file(name)!.async("string")}`);
  }
  return parts.join("\n");
}

const out: Record<string, unknown> = {};
const themes = E.fastrThemeIds() as string[];
const scope = ":root .fm-live-scope";

out["syntax_doc"] = E.FASTR_MD_SYNTAX_DOC;
out["block_snippets"] = E.FASTR_BLOCK_SNIPPETS;
out["surface_css"] = E.buildFastrEditorSurfaceCss(scope);
for (const theme of themes) {
  out[`css/${theme}`] = E.buildFastrReportCss(theme);
  out[`css_scoped/${theme}`] = E.buildFastrReportCss(theme, undefined, scope);
  out[`css_custom/${theme}`] = E.buildFastrReportCss(theme, {
    page: "#101820",
    ink: "#f4f1ea",
    accent: "#e0a526",
  });
  out[`chart_palette/${theme}`] = E.fastrChartPalette(theme, undefined);
}

for (const { name, body } of bodies) {
  const settings = E.readFastrDocumentSettings(body);
  out[`${name}/settings`] = settings;
  out[`${name}/html_anchored`] = E.renderFastrMarkdownToHtml(body, {
    lineAnchors: true,
  });
  out[`${name}/html`] = E.renderFastrMarkdownToHtml(body, {
    lineAnchors: false,
  });
  out[`${name}/outline`] = E.fastrDocumentOutline(body);
  out[`${name}/outline_deep`] = E.fastrDocumentOutline(body, 6);
  out[`${name}/regions`] = E.fastrLiveRegions(body.split("\n"));
  out[`${name}/paged_css`] = E.buildFastrPagedCss(settings.page, FOOTER);
  out[`${name}/sheet_px`] = E.fastrSheetPx(settings.page);
  out[`${name}/embeds`] = E.findReportEmbeds(body);
  // The Word document on a light, a dark and a loud theme.
  for (const theme of ["default", "ministry", "bauhaus"]) {
    if (!themes.includes(theme)) continue;
    out[`${name}/word/${theme}`] = await wordXml(body, theme);
  }
}

await Deno.writeTextFile(outPath, JSON.stringify(out, null, 1));
console.log(
  `${
    Object.keys(out).length
  } entries from ${bodies.length} bodies on ${themes.length} themes -> ${outPath}`,
);
