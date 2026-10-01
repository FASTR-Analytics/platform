// =============================================================================
// DATA TRANSFORM: reports.config / reports.figures / reports.images
// =============================================================================
//
// Table:    reports (bumps the owning products.last_updated)
// Columns:  config, figures, images (JSON)
// Schemas:  lib/types/reports.ts
//           → reportConfigSchema, reportFiguresSchema, reportImagesSchema
//
// New table (v1): no legacy shapes yet, so this is the startup validation
// sweep that lets runtime trust the database. Add transform blocks here (in
// order, idempotent) when a stored shape changes.
//
// =============================================================================

import {
  FASTR_REPORT_THEMES,
  getReportFormat,
  listFastrContainerDefects,
  REPORT_HTML_STYLES,
  reportConfigSchema,
  reportFiguresSchema,
  reportImagesSchema,
} from "lib";
import type { Sql } from "postgres";
import {
  type MigrationStats,
  rawJsonNeedsForcedTransform,
} from "./po_config.ts";
import {
  adminArea2OfStoredScope,
  type FigureBlockMut,
  getTransformLocalization,
  rawJsonNeedsFigureBlockTransform,
  transformFigureBlock,
  transformFigureBlockToBundle,
} from "./_figure_block.ts";

export async function migrateReports(
  tx: Sql,
  countryIso3: string,
): Promise<MigrationStats> {
  const localization = getTransformLocalization(countryIso3);

  const rows = await tx<
    {
      id: string;
      label: string;
      config: string | null;
      body: string;
      figures: string;
      images: string;
      run_id: string;
      scope_definition: string;
    }[]
  >`
    SELECT r.id, p.label, r.config, r.body, r.figures, r.images,
           p.run_id, sc.definition AS scope_definition
    FROM reports r
    JOIN products p ON p.id = r.id
    JOIN scopes sc ON sc.id = p.scope_id
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = row.config ? JSON.parse(row.config) : {};
    const figures = JSON.parse(row.figures);
    const images = JSON.parse(row.images);

    // Already valid? Skip: unless legacy keys (which safeParse silently
    // strips) still need the embedded-config rename, or the row is still on
    // the retired markdown format (Block 4). figureInputs drift is
    // covered by reportFiguresSchema: figureBlockSchema validates figureInputs
    // against panther's zFigureInputs (lib/types figureInputsSchema).
    if (
      reportConfigSchema.safeParse(config).success &&
      reportFiguresSchema.safeParse(figures).success &&
      reportImagesSchema.safeParse(images).success &&
      !rawJsonNeedsForcedTransform(row.figures) &&
      !rawJsonNeedsFigureBlockTransform(row.figures) &&
      getReportFormat(config) !== "markdown"
    ) {
      continue;
    }
    const storedCanonical = {
      config: JSON.stringify(config),
      figures: JSON.stringify(figures),
      images: JSON.stringify(images),
    };

    // Block 1: Figure-block transforms shared with slides: embedded
    // PO config, source.type rename, figureInputs normalization. Repairs a
    // report figure whose embedded config drifted under a po_config change.
    // (figureInputs drift is caught by the skip gate above via
    // figureInputsSchema inside figureBlockSchema.)
    if (figures && typeof figures === "object") {
      for (const block of Object.values(figures)) {
        transformFigureBlock(block as FigureBlockMut);
        transformFigureBlockToBundle(block as FigureBlockMut, localization, {
          runId: row.run_id,
          adminArea2: adminArea2OfStoredScope(row.scope_definition),
        });
      }
    }

    // Block 2: retired html style presets (2026-08-31 — the artistic set was
    // replaced by the professional set). A stored value outside the current
    // enum reads as "default" everywhere at runtime (getReportHtmlStyle is
    // total), so drop the key instead of failing the boot validation. The
    // skip gate above routes these rows here automatically: an invalid enum
    // value fails safeParse, so no forced gate is needed.
    if (
      typeof config.htmlStyle === "string" &&
      !(REPORT_HTML_STYLES as readonly string[]).includes(config.htmlStyle)
    ) {
      delete config.htmlStyle;
    }

    // Block 3: retired fastr themes (2026-09-03 — blueprint removed;
    // 2026-09-21 — classic removed; 2026-09-29 — monochrome removed). Same
    // mechanics as Block 2: an out-of-enum value fails safeParse and routes
    // the row here; dropping the key falls the report back to the default
    // theme (the theme is a starting point, changeable in the editor).
    // Monochrome instead lands on minimal, the other greyscale theme, since
    // the default's blue would be a visible re-colour.
    if (config.fastrTheme === "monochrome") {
      config.fastrTheme = "minimal";
    }
    if (
      typeof config.fastrTheme === "string" &&
      !(FASTR_REPORT_THEMES as readonly string[]).includes(config.fastrTheme)
    ) {
      delete config.fastrTheme;
    }

    // Block 4: markdown to FASTR Markdown (2026-09-30). The plain-markdown
    // format is retired: every report still on it becomes a FASTR Markdown
    // report on the `legacy` theme, which reproduces the panther markdown
    // look those reports render in today (the theme's own note in
    // lib/types/report_fastr_themes.ts). The BODY is deliberately untouched.
    // A markdown body is ALREADY valid FASTR Markdown: embed tokens are the
    // same (buildReportEmbedToken special-cases html alone), headings and
    // sections are the same `#` scan, and both parsers are markdown-it with
    // the same options. So this is a config flip and nothing else, which is
    // also what makes it reversible: flipping `format` back restores the old
    // render exactly, because nothing was rewritten.
    //
    // The skip gate above forces markdown rows here, since their config is
    // perfectly valid and would otherwise be skipped (the Skip-Gate Gotcha in
    // PROTOCOL_APP_MIGRATIONS.md). It is self-terminating: a converted row
    // reads as fastr on the next boot and is skipped like any other.
    //
    // getReportFormat is TOTAL, so this also catches the oldest reports,
    // which carry no `format` key at all (absent reads as markdown), and any
    // row holding a format that no longer exists.
    //
    // `themeChosen` is deliberately NOT written. Its absence is the mark of a
    // report that was never offered the theme modal, so a converted report is
    // not interrupted about a choice it was never given; the Page menu still
    // reaches the theme whenever its author wants a different one.
    if (getReportFormat(config) === "markdown") {
      config.format = "fastr";
      config.fastrTheme = "legacy";
      // One body shape does NOT survive the move silently: a line that reads
      // as a `:::` container fence was inert prose in markdown and opens a
      // block in FASTR Markdown, and an unclosed one runs to the end of the
      // document, swallowing everything under it. Nothing is rewritten (the
      // body is the author's), so the row is converted either way and the
      // report is NAMED here instead, for a human to open and close the
      // fence. Deploy logs are the delivery mechanism: this runs once.
      const defects = listFastrContainerDefects(row.body);
      if (defects.length > 0) {
        console.warn(
          `[reports] converted "${row.label}" (${row.id}) to FASTR Markdown, ` +
            `but its body has ${defects.length} ` +
            `\`:::\` block problem${
              defects.length === 1 ? "" : "s"
            } that were ` +
            `inert as plain markdown: ${
              defects.slice(0, 5).map((d) => `line ${d.line}`).join(", ")
            }. Open the report and close or escape the fence.`,
        );
      }
    }

    // Throws if the row is still invalid after every transform (including
    // figureInputs drift the upgrader does not fix): the runner then refuses
    // to start the server. The warn above names the offending figure block.
    const validated = {
      config: JSON.stringify(reportConfigSchema.parse(config)),
      figures: JSON.stringify(reportFiguresSchema.parse(figures)),
      images: JSON.stringify(reportImagesSchema.parse(images)),
    };

    // Output identical to stored (e.g. a forced-scan false positive)? Skip the
    // write so the row doesn't churn last_updated on every boot.
    if (
      validated.config === storedCanonical.config &&
      validated.figures === storedCanonical.figures &&
      validated.images === storedCanonical.images
    ) {
      continue;
    }

    await tx`
      UPDATE reports
      SET config = ${validated.config},
          figures = ${validated.figures},
          images = ${validated.images}
      WHERE id = ${row.id}
    `;
    await tx`UPDATE products SET last_updated = ${now} WHERE id = ${row.id}`;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
