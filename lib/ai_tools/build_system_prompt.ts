import {
  getCountryLabel,
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "../consts.ts";
import type { InstanceState } from "../types/instance_sse.ts";
import type { ProjectState } from "../types/project_sse.ts";
import type { ReportFormat, ReportHtmlStyle } from "../types/reports.ts";
import { INFO_TOPICS } from "./info_catalog.ts";

// ── Entry point ──
//
// Per-mode instructions no longer live here (Rung 3, PLAN_FUTURE_AI_ADOPTIONS.md
// feature 1): each getXInstructions() function below is now a view's
// instructions in ai_views.ts, delivered as a per-turn ephemeral section by
// panther's view controller. This accessor takes no view/mode argument, so it
// is BYTE-STABLE across navigation — the point of the migration (prompt-cache
// breakpoint keeps hitting when the user just switches tabs/editors).

export function buildSystemPromptForContext(
  instance: InstanceState,
  projectState: ProjectState,
  toolCatalog: string,
): string {
  const currentDate = new Date().toISOString().split("T")[0];
  const dateHeader = `**CURRENT DATE: ${currentDate}**\n\n---\n\n`;

  const contextSection = buildAISystemContext(instance, projectState);
  const referenceDocsSection = buildReferenceDocsSection();
  const baseInstructions = getBaseInstructions();
  const toolsSection = `\n# Available Tools\n\n${toolCatalog}\n`;

  return `${dateHeader}${contextSection}${referenceDocsSection}${baseInstructions}${toolsSection}`;
}

// ── Reference documentation catalog ──

function buildReferenceDocsSection(): string {
  if (INFO_TOPICS.length === 0) return "";
  const sections: string[] = [];
  sections.push("# Reference documentation");
  sections.push("");
  sections.push(
    "Authoritative reference docs you can load on demand with the **get_info** tool. When a task relates to one of these topics (for example, building an ICEH equity profile report), call get_info for that topic FIRST and follow it.",
  );
  sections.push("");
  for (const t of INFO_TOPICS) {
    sections.push(`- **${t.topic}** — ${t.title}: ${t.description}`);
  }
  sections.push("");
  return sections.join("\n");
}

// ── Project context ──

function buildAISystemContext(
  instance: InstanceState,
  projectState: ProjectState,
): string {
  const sections: string[] = [];

  sections.push("# Instance Information");
  sections.push("");

  if (instance.countryIso3) {
    sections.push(
      `**Country:** ${
        getCountryLabel(instance.countryIso3)
      } (${instance.countryIso3})`,
    );
  }

  sections.push(`**Instance:** ${instance.instanceName}`);
  sections.push("");

  sections.push("# Terminology");
  sections.push("");
  sections.push("**Geographic levels:**");
  sections.push("- admin_area_1 is always the national level");
  if (instance.maxAdminArea >= 2) {
    const aa = instance.maxAdminArea;
    const labels = instance.adminAreaLabels;
    const hasCustomLabels = labels.label2 || labels.label3 || labels.label4;

    if (hasCustomLabels) {
      sections.push("- Sub-national levels in this instance:");
      if (aa >= 2 && labels.label2) {
        sections.push(`  - admin_area_2 = "${labels.label2}"`);
      }
      if (aa >= 3 && labels.label3) {
        sections.push(`  - admin_area_3 = "${labels.label3}"`);
      }
      if (aa >= 4 && labels.label4) {
        sections.push(`  - admin_area_4 = "${labels.label4}"`);
      }
      sections.push(
        "- Use these terms instead of 'admin_area_2' etc. when communicating with the user",
      );
    } else {
      const sub = aa >= 4
        ? "admin_area_2, admin_area_3, admin_area_4 etc."
        : aa >= 3
        ? "admin_area_2, admin_area_3 etc."
        : "admin_area_2 etc.";
      sections.push(`- ${sub} are sub-national levels. For example:`);
      const examples: {
        country: string;
        aa2: string;
        aa3?: string;
        aa4?: string;
      }[] = [
        {
          country: "Nigeria",
          aa2: "Zone",
          aa3: "State",
          aa4: "LGA (Local Government Area)",
        },
        { country: "Ghana", aa2: "Region", aa3: "District" },
        { country: "Burkina Faso", aa2: "Région", aa3: "Province" },
        { country: "Zambia", aa2: "Province", aa3: "District" },
        { country: "Liberia", aa2: "County", aa3: "District" },
        { country: "Sierra Leone", aa2: "District", aa3: "District Council" },
        {
          country: "République Démocratique du Congo (RDC)",
          aa2: "Province",
          aa3: "Zone de Santé",
        },
      ];
      for (const ex of examples) {
        let line = `  - ${ex.country}: admin_area_2 = ${ex.aa2}`;
        if (aa >= 3 && ex.aa3) line += `, admin_area_3 = ${ex.aa3}`;
        if (aa >= 4 && ex.aa4) line += `, admin_area_4 = ${ex.aa4}`;
        sections.push(line);
      }
      sections.push(
        "- If this instance's country matches one of the above, use that country's terminology instead of 'admin_area_2' etc.",
      );
    }
  }
  sections.push("");
  const hasHmis = instance.datasetsWithData.includes("hmis");
  const hasHfa = instance.datasetsWithData.includes("hfa");
  const hasIceh = instance.datasetsWithData.includes("iceh");
  if (hasHmis || hasHfa || hasIceh) {
    sections.push("**Data sources:**");
    if (hasHmis) {
      sections.push(
        "- HMIS: Health Management Information System (routine facility reporting)",
      );
    }
    if (hasHfa) {
      sections.push("- HFA: Health Facility Assessment (facility survey data)");
    }
    if (hasIceh) {
      sections.push(
        "- ICEH: International Center for Equity in Health survey data (DHS, MICS, and other nationally representative household surveys)",
      );
    }
    sections.push("");
  }

  sections.push("# Project");
  sections.push("");
  sections.push(`**Name:** ${projectState.label}`);

  const hmisDataset = projectState.projectDatasets.find(
    (d) => d.datasetType === "hmis",
  );
  const hfaDataset = projectState.projectDatasets.find(
    (d) => d.datasetType === "hfa",
  );
  const icehDataset = projectState.projectDatasets.find(
    (d) => d.datasetType === "iceh",
  );

  if (hmisDataset || hfaDataset || icehDataset) {
    sections.push("");
    sections.push("**Loaded datasets:**");
    if (hmisDataset && hmisDataset.datasetType === "hmis") {
      sections.push(`- HMIS data (version ${hmisDataset.info.version.id})`);
    }
    if (hfaDataset) {
      sections.push(`- HFA data`);
    }
    if (icehDataset) {
      sections.push(`- ICEH survey data`);
    }
  }

  if (projectState.commonIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**Common indicators (${projectState.commonIndicators.length}):**`,
    );
    for (const ind of projectState.commonIndicators) {
      sections.push(`- ${ind.id}: ${ind.label}`);
    }
  }

  if (projectState.icehIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**ICEH indicators (${projectState.icehIndicators.length}):**`,
    );
    for (const ind of projectState.icehIndicators) {
      sections.push(`- ${ind.id}: ${ind.label}`);
    }
  }

  if (projectState.projectModules.length > 0) {
    sections.push("");
    sections.push(
      `**Installed analysis modules:** ${projectState.projectModules.length}`,
    );
  }

  if (instance.structure) {
    sections.push("");
    sections.push("**Data coverage:**");
    sections.push(
      `- ${instance.structure.facilitiesHmis} HMIS facilities, ${instance.structure.facilitiesHfa} HFA facilities`,
    );
    if (instance.structure.adminArea2s > 0) {
      sections.push(`- ${instance.structure.adminArea2s} admin area 2s`);
    }
    if (instance.structure.adminArea3s > 0) {
      sections.push(`- ${instance.structure.adminArea3s} admin area 3s`);
    }
  }

  sections.push("");
  sections.push(
    `**Available visualizations:** ${projectState.visualizations.length} (use get_available_visualizations for details)`,
  );
  sections.push(
    `**Available slide decks:** ${projectState.slideDecks.length} (use get_available_slide_decks for details)`,
  );
  sections.push(
    `**Available reports:** ${projectState.reports.length} (use get_available_reports for details)`,
  );

  if (projectState.aiContext.trim()) {
    sections.push("");
    sections.push("# Additional Project Context");
    sections.push("");
    sections.push(projectState.aiContext.trim());
  }

  sections.push("");
  sections.push("---");
  sections.push("");

  return sections.join("\n");
}

// ── Base instructions ──

function getBaseInstructions(): string {
  return `
# Role and Purpose

You are an AI assistant helping users explore, analyze, and present their health data. You can query data, show draft visualizations, and help create slide decks.

# Core Principles

1. **CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims
2. **Never fabricate statistics** - Only report what you've verified from the data
3. **Acknowledge limitations** - Be clear about data gaps or quality issues
4. **Be concise** - Keep explanations actionable and to the point
5. **Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.

# Indicator Interpretation Framework

When analyzing indicators, first determine the directionality:

**Positive indicators** (↑ good, ↓ concerning):
- Service delivery: ANC visits, deliveries, PNC, immunizations, OPD, family planning, skilled birth attendance
- Expected values: "surplus" = positive, "disruption" = concern

**Negative indicators** (↑ bad, ↓ good):
- Mortality/adverse outcomes: maternal deaths, neonatal deaths, stillbirths
- Quality failures: dropout rates, outlier rates, stockout rates

**Critical rule**: Before writing any interpretation, verify the indicator type. An increase in deaths is never an "improvement"; a decrease in service coverage is never "progress". Match your language to what the indicator measures.
`;
}

// ── Viewing mode instructions ──
// Each function below is used as a view's instructions in ai_views.ts.

export function getViewingVisualizationsInstructions(): string {
  return `# Current View: Visualizations Library

The user is browsing their saved visualizations.

## Primary Tools (most relevant here)

**get_available_visualizations** - List all saved visualizations
**get_visualization_data** - Get data for a specific visualization by ID

## Actions

- Help explore existing visualizations
- Answer questions about visualizations
- Suggest new visualizations to create`;
}

export function getViewingSlideDecksInstructions(): string {
  return `# Current View: Slide Decks Library

The user is browsing their slide decks.

## Actions

- Help explore existing slide decks
- Answer questions about deck content
- Suggest new decks to create`;
}

export function getViewingReportsInstructions(): string {
  return `# Current View: Reports Library

The user is browsing their long-form reports (documents with embedded live data figures). A report's body is either **markdown** or **HTML** — fixed when the report is created (get_report states which).

## Primary Tools (most relevant here)

**get_available_reports** - List all reports (with each report's format)
**get_report** - Get a report's full body + embedded figure/image ids
**create_report** - Create a new MARKDOWN report from a markdown body

## Actions

- Help explore existing reports
- Draft a new report (use create_report with well-structured markdown: headings, paragraphs, lists, tables)
- Do NOT put raw HTML in markdown report bodies; for live data tables/charts, the user inserts figures via the editor
- HTML-format reports are created in the FASTR report editor (Create report → Format: HTML) and edited there with the AI`;
}

// Styled html presets (chosen on the Create-report form, stored in config,
// fixed at creation): each is a prescriptive design language the model writes
// its own stylesheet from, so successive rewrites come out consistent. They
// are briefs, not CSS dumps, and they only ever say things the sanitizer
// allows (fonts via @import — <link> is stripped; static markup — <script> is
// stripped). The shared constraints ride once at the end of every brief.

type StyledReportStyle = Exclude<ReportHtmlStyle, "default">;

const REPORT_STYLE_SHARED_CONSTRAINTS =
  `**Hard constraints (every style)**: static markup only — no <script> (stripped; do NOT emit JS-built content) and no <link> (load fonts via @import inside the <style> block). Inline <svg> is allowed for ornament and small sparklines. Close every element; prefix ids (sec-…). Responsive via auto-fit grids or a single column; break-inside:avoid on cards and figures for print. Figure embeds render as white-background PNG <img>s that keep your class/style/id — design their containers accordingly.`;

export const REPORT_STYLE_BRIEFS: Record<
  StyledReportStyle,
  { name: string; brief: string }
> = {
  editorial: {
    name: "Editorial",
    brief:
      `A designed editorial briefing — a magazine front, not a plain document.

**Fonts** — first line of the <style> block:
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
Headlines: 'IBM Plex Sans Condensed' (600/700, tight tracking). Body: 'IBM Plex Sans'. Numbers, labels, eyebrows, badges: 'IBM Plex Mono' with font-variant-numeric: tabular-nums. Always give fallback stacks.

**Tokens** — define on :root and use throughout:
--ground:#E9EEF3 (page background); --surface:#FFFFFF (cards); --sunk:#DDE5EC; --ink:#0F2130; --muted:#5B6B7A; --faint:#8A98A5; --rule:#C9D5DF; accents --accent-a:#B03F35 (negative/alert), --accent-b:#14685A (positive/confirm), --accent-c:#9C6B0E (caution), --link:#2A6FA8.
The page sits on --ground; content lives in --surface blocks with 1px solid var(--rule) and border-radius 8px. Body text ~16px/1.6 in --ink; secondary text in --muted.

**Structure** (adapt to the content — not every report needs every part):
- Masthead: mono uppercase eyebrow (report series · date) → big condensed headline, font-size clamp(32px,5vw,52px), letter-spacing -0.015em → muted standfirst ≤62ch → optionally a stat-tally strip (bordered flex row; big mono number over a small muted label per cell).
- Sections: an h2 with a small mono count beside it, then a muted lede ≤66ch, then the content block.
- Card grids: repeat(auto-fill,minmax(330px,1fr)); each card a --surface panel with a 3px colored border-top (accent by category) and a matching uppercase mono badge.
- A "how to read this" key box near the top when the report needs interpretation rules.
- Data tables: condensed bold headers, hairline row rules, mono right-set numeric cells, small rounded mono "pill" labels for statuses.
- A notes/caveats grid of small cards; a bordered footer with source and method in small --faint text.

**Figures**: wrap each embed in a figure card — --surface, rule border, padding, small mono caption line. Keep the card body white.`,
  },
  swiss: {
    name: "Swiss / International",
    brief:
      `The International Typographic Style: a strict grid, objective typography, one red, and nothing decorative at all.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap'); everything is 'Inter' (Helvetica idiom) — no second family. Tabular figures for numbers.

**Palette**: white #FFFFFF page, ink #111111, grey #6B6B6B for secondary text, hairlines #DDDDDD, and exactly ONE accent: Swiss red #E30613 — used sparingly (section numbers, one rule, key data points). Nothing else. No shadows, no border-radius, no gradients.

**Devices**: flush-left everything on a visible column discipline (max-width ~1000px, generous asymmetric whitespace); massive headlines clamp(40px,7vw,80px) at weight 900 with letter-spacing -0.03em; small bold uppercase labels (11px, +0.08em) above sections; hairline 1px rules to divide, a single 8px red rule under the masthead; section numbers set large in red ("01", "02") beside h2s; data tables with hairline rows, no vertical rules, right-set tabular numerals.

**Figures**: unframed on the white page — just a hairline rule above, a small grey caption below. Let the whitespace frame them.`,
  },
  bauhaus: {
    name: "Bauhaus",
    brief:
      `Bauhaus / constructivist: primary-color geometry doing the work of ornament.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Space+Grotesk:wght@400;500&display=swap'); headlines 'Archivo' 900 (some set uppercase), body 'Space Grotesk'.

**Palette**: warm paper #F5F1E8, ink #1A1A1A, and the primaries: red #D02E26, blue #1F5CA9, yellow #F0B429. Use them as SHAPES, not tints.

**Devices**: geometric blocks — a solid red square beside the title, a yellow circle behind a key number, a blue bar as a section divider; thick rules (6–10px solid ink); diagonal energy via skewed section headers or clip-path banners; enormous numerals (stat callouts at 64–96px, weight 900); inline SVG circles/triangles/bars as ornament; section markers as small colored squares in a row. Grid layouts with hard edges — no border-radius, no shadows.

**Figures**: white panels with a thick (4–6px) single-color border, each section cycling through the three primaries; captions in small uppercase 'Archivo'.`,
  },
  blueprint: {
    name: "Blueprint",
    brief:
      `An engineering drawing sheet: white line-work on blueprint blue, every figure a numbered plate.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Archivo+Narrow:wght@500;700&display=swap'); labels/annotations/numbers 'IBM Plex Mono', headings 'Archivo Narrow' uppercase +0.06em tracking.

**Palette**: deep blueprint blue ground #123B63 (page background), line-work and text in #E7F0F7, dimmer lines #7FA6C6, panel fill a slightly lighter #1B4A78. No other hues.

**Devices**: a faint drafting grid on the page via repeating-linear-gradient (1px lines every ~24px at low opacity); 1px solid light borders with small corner tick marks on every panel; dashed rules as dividers; sections labelled like sheet zones ("SECTION A — COVERAGE"); mono annotation callouts with leader-line dashes; a title block in the footer laid out like a drawing sheet's — project, date, sheet no., scale — as a small bordered table.

**Figures**: this is the signature move — each figure is a PLATE: a white card (the raster stays on white) inside a light border with corner ticks, labelled "FIG. 01 — <CAPTION>" in mono uppercase above or below.`,
  },
  broadsheet: {
    name: "Broadsheet",
    brief:
      `A newspaper front page: masthead, columns, kickers, dinkuses.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700;900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Oswald:wght@500&display=swap'); masthead + headlines 'Playfair Display', body 'Source Serif 4', kickers/bylines 'Oswald' uppercase.

**Palette**: newsprint #FAF7F0, ink #1C1C1C, muted #575757, hairlines #C8C2B4. Optionally one spot red for the edition line. Essentially monochrome.

**Devices**: centered masthead — the report title huge in 'Playfair' 900 between thin double rules, with an edition line (date · series · "Vol. 1") in small caps; a lead story block: kicker in 'Oswald', multi-deck headline, standfirst in italic; body text in 2–3 columns via CSS columns (column-rule: 1px solid the hairline color) for running sections, single column for tables; drop cap on the opening paragraph; "* * *" dinkus dividers between stories; pull quotes in large italic 'Playfair' with rules above and below.

**Figures**: newspaper photo treatment — thin 1px ink border, italic serif caption underneath with a bold lead-in ("Coverage trends."), optionally spanning all columns.`,
  },
  risograph: {
    name: "Risograph",
    brief:
      `A two-ink riso zine print: paper plus exactly two vibrant inks, with deliberate misregistration.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap'); headings 'Space Grotesk' 700, body 'Space Grotesk' 500, labels/stamps 'Space Mono'.

**Palette**: paper #F7F3E8 and TWO inks only — riso blue #0078BF and riso pink #FF48B0 — plus a soft navy #1D3159 standing in for their overprint (text). Never introduce a third hue; tints of the two inks are fine.

**Devices**: chunky headings with an offset "misregistration" shadow (text-shadow: 3px 3px 0 the pink); solid ink blocks with knocked-out paper-color text; stamped labels — bordered uppercase mono tags rotated -2deg; dotted halftone textures via radial-gradient dots at low opacity on section bands; thick (3px) borders with 12px radius — friendly, hand-made edges; alternate sections tinted with a pale wash of each ink.

**Figures**: white cards with a 3px blue border and a pink 6px offset shadow (box-shadow: 6px 6px 0 pink); mono captions with a stamped number tag ("No. 03").`,
  },
  artdeco: {
    name: "Art deco",
    brief:
      `A 1920s gala programme: symmetric, gilded, vertical elegance.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Marcellus&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Josefin+Sans:wght@300;400&display=swap'); display 'Marcellus' with wide letter-spacing (+0.12em, uppercase), body 'Cormorant Garamond', small labels 'Josefin Sans' uppercase light.

**Palette**: cream #F5EFE0, near-black ink #191714, gold #B08D3E as THE accent, and one deep secondary (forest #1F3A2E or burgundy #4E2430) for large fields. Gold is for rules, ornament and numerals — never body text.

**Devices**: symmetric, centered composition throughout; thin double rules (1px + 1px with a gap) framing the masthead and footer; SVG deco ornament — sunburst fans, chevrons, stepped corners — drawn inline in gold; section numerals inside small gold-ringed circles; tall narrow title stacks (each word on its own line, letterspaced); framed panels with a fine gold border and stepped corner marks; small caps everywhere labels appear.

**Figures**: framed like plates in a programme — double-line border with gold corner ornaments, centered 'Josefin Sans' small-caps caption beneath.`,
  },
  japanese: {
    name: "Japanese minimal",
    brief:
      `Ma — negative space as the design. Quiet, vertical rhythm, one vermilion seal.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500&display=swap'); display 'Shippori Mincho' (serene serif), body 'Zen Kaku Gothic New' at a modest size (15–16px, line-height 1.9).

**Palette**: warm white #FBFAF7, sumi ink #2B2B28, soft grey #8C8A84, and a single vermilion #C73E2E used ONCE per view — a small square "seal" beside the title (a 14px filled square, or the report's initial knocked out of it). Nothing else is colored.

**Devices**: extreme whitespace — section padding of 96px+ vertically, content measure ≤58ch; NO boxes, cards, borders or backgrounds — hierarchy comes from space, size and weight alone; headings small and calm (h2 at ~20px, 'Shippori Mincho' 700) with 1.5em of clear space above; at most one thin 1px rule under the masthead; lists without bullets (just indentation and space); numbers set slightly larger than their labels, never bold-shouted; the footer a single quiet grey line.

**Figures**: unframed, floating in generous margin — no border, no card; a tiny grey caption set well below the image; one figure per screenful of space.`,
  },
  monochrome: {
    name: "Monochrome ink",
    brief:
      `Pure black on white. The figures' chart colors are the ONLY color on the page — that is the point.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@300;400;600;800;900&display=swap'); one family, 'Libre Franklin', doing everything through its weight range.

**Palette**: #000000 on #FFFFFF. Greys only as genuine secondary text (#666). No accent color anywhere — not in rules, badges, links (links are black, underlined). Zero.

**Devices**: hierarchy entirely from weight, size and space — hairline 300 for big standfirsts, 900 for headlines; solid black blocks with white knocked-out text for the masthead band and key stat callouts; heavy 4px black top rules opening each section, hairline rules inside; tables with a solid black header band (white text) and hairline rows; emphasis via weight jumps, never color; oversized black numerals for stats.

**Figures**: because they carry the page's only color, give them room — full-width, a 1px black frame, bold black caption line above ("Figure 2 — Penta1 coverage") and nothing competing nearby.`,
  },
  terminal: {
    name: "Terminal",
    brief:
      `A phosphor terminal session: mono everything, green on near-black, CLI furniture.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap'); EVERYTHING is 'JetBrains Mono' — headings included.

**Palette**: ground #0C0F0D, panels #121A15, phosphor green #33FF66 for headings/prompts/key values, dim green-grey #9BB39F for body text, borders #1E3A2A. Amber #FFB000 for warnings only. No white text.

**Devices**: section headers as commands — "$ fastr report --section coverage" in green, output following; or banner style "== 02 · COVERAGE ==" padded with = signs; 1px solid borders with a small label breaking the top edge (fieldset/legend idiom) to fake box-drawing frames; status tags in brackets — [OK] green, [WARN] amber, [FAIL] inverted; tables as aligned CLI output (mono makes columns line up; hairline row rules); key-value readouts as "metric ........: value" dot-leader lines; a blinking block cursor after the final line via a CSS keyframe animation.

**Figures**: white "screenshot" cards (the raster needs its white ground) with a slim terminal title bar above — dark strip, green mono filename ("anc1_coverage.png"), three small circles left.`,
  },
  brutalist: {
    name: "Brutalist",
    brief:
      `Web brutalism: raw, loud, anti-polish — structure exposed, defaults weaponized.

**Fonts**: system stack ONLY — font-family: Arial, Helvetica, sans-serif for structure and Times New Roman for body passages if you want the clash; no @import at all (using the machine's defaults IS the aesthetic). Monospace (Courier New) for data.

**Palette**: white, black, and pure yellow #FFFF00 as highlight blocks; optionally pure blue #0000EE for links (the browser default blue, underlined, visited-purple welcome). No gradients, no radius, no soft anything.

**Devices**: harsh 3–4px solid black borders around everything; hard offset shadows (box-shadow: 8px 8px 0 #000) on key panels; headings oversized and unpolished (h1 at 64px+ plain bold, maybe uppercase, no letter-spacing finesse); yellow highlighter marks behind key phrases (background #FFFF00 on inline spans); visible structure — sections numbered plainly "1.", "2.", a crude bordered table of contents at top; tables with full borders on every cell like default HTML; deliberate density and asymmetry; text-decoration: underline on anything interactive-looking.

**Figures**: plain <img> with a 4px black border and a hard offset shadow; caption in bold Courier above it like a file label ("FIG_02_PENTA1.PNG").`,
  },
};

export function getEditingReportInstructions(
  reportLabel: string,
  format: ReportFormat = "markdown",
  htmlStyle: ReportHtmlStyle = "default",
  customStyle?: { label: string; brief: string; referenceCss?: string | null },
): string {
  const common = `## How editing works

- Every TEXT edit you propose is STAGED as a diff the user accepts or rejects — nothing is applied silently. Make focused, well-scoped edits.
- **Figure edits are different from text edits.** update_report_figure applies straight to the live preview and saves — it is NOT staged as a diff (the figure's body token doesn't change). Body/text edits and figure inserts ARE staged for accept/reject.
- Prefer **rewrite_section** for targeted changes; use **replace_text** for small/sentence-level edits; use **rewrite_report** only for whole-document restructures.
- ALWAYS call get_report_editor first: it returns the current body, the format, and a headings index (each heading's 1-based line, level, and the exact line range + mode of its section).
- You may only reference figure/image ids that already exist; do not invent embed ids. Use **insert_figure** to add a new figure from a visualization or metric.`;
  if (format === "html") {
    // Styled reports: the style statement leads (a trailing brief gets
    // under-weighted against the user's content prompt — observed on
    // testing: default and editorial produced near-identical output until
    // the user demanded styling explicitly), and the brief follows at the
    // end. The rewrite_report validator backstops this: a styled body
    // without a real stylesheet is rejected before staging.
    // A custom style (user-authored library brief, resolved live with a
    // creation-time snapshot as fallback - S12) wins over the preset field.
    // A distilled style carries the source report's ACTUAL stylesheet — the
    // highest-fidelity encoding of the design. The model must REUSE it, not
    // re-derive CSS from the prose brief (that was tried; it drifts).
    const refCss = customStyle?.referenceCss?.trim();
    const styled = customStyle
      ? {
        name: customStyle.label,
        brief: refCss
          ? `${customStyle.brief}

### Reference stylesheet — REUSE THIS CSS

The stylesheet below is the style's canonical implementation, taken verbatim from the report this style was saved from. When you write or restructure this report, START from this CSS: include it (essentially verbatim — you may prune rules for components you don't use and add rules for ones you need) in the report's <style> block, and write markup that uses ITS class names and structure. Do not re-invent a stylesheet from the prose above; the prose describes how to USE these classes.

\`\`\`css
${refCss}
\`\`\``
          : customStyle.brief,
      }
      : htmlStyle !== "default"
      ? REPORT_STYLE_BRIEFS[htmlStyle]
      : undefined;
    const styleBanner = styled
      ? `\n\n**THIS REPORT'S STYLE IS "${styled.name.toUpperCase()}".** Whenever you write or restructure this report (rewrite_report, or a rewrite_section that adds new material), produce a FULLY DESIGNED page in that style — with the same visual ambition you would bring to a standalone HTML page in a normal Claude conversation: complete stylesheet, designed structure, typographic hierarchy. Do this on the first write, without being asked. A plainly-styled document is WRONG for this report. The design language is in the "Design brief" section at the end of these instructions.`
      : "";
    const styleSection = styled
      ? `\n\n## Design brief: ${styled.name}\n\n${styled.brief}\n\n${REPORT_STYLE_SHARED_CONSTRAINTS}`
      : "";
    return `# Current View: Editing Report "${reportLabel}" (HTML format${
      styled ? `, ${styled.name} style` : ""
    })

The user is editing a long-form report whose body is **HTML** (not markdown) with embedded live figures.${styleBanner}

${common}

## Writing HTML for this report

- Write BODY-ONLY markup: no <!DOCTYPE>, <html>, <head> or <body> tags. Every element must be closed (</div>, </p>, </section> …) — a body with stray or missing close tags is rejected before it is staged.
- A <style> block anywhere in the body applies to the whole report document (the report renders in its own page, isolated from the app). The page is a white ~56rem-wide column with browser-default typography unless your CSS says otherwise. Web images and @import'ed fonts are allowed; <link>, <script>, <iframe>, <form> controls and event handlers are stripped.
- Avoid element ids that collide with document properties (title, body, images, links, forms, head, open, hidden, dir, action, method, name …) — they are stripped by the sanitizer. Prefix ids, e.g. id="sec-results".
- Embed tokens are <img src="figure:<id>" alt="caption"> and <img src="image:<id>" alt="caption">, one per line on its own line. They render as an <img> that keeps your class/style/id, so you can lay figures out with your own CSS (e.g. class="two-up"). Hand-written <table>s for small summaries are fine; for data, prefer figures.
- **Sections** (rewrite_section, the headings index): a section is EITHER the heading's wrapper element — when the heading (possibly inside a header <div>) is the first content of a <section>/<div> that holds no other heading of the same or higher level — OR, otherwise, the flat run of siblings from the heading to the next heading of the same/higher level. get_report_editor reports the mode ("wrapper <section id=…>" or "flat") and the exact line range for every heading. Your newBody replaces that WHOLE range: in wrapper mode it must start with the same wrapper tag (<section …> … </section>); in flat mode it starts with the heading.
- For insert_figure in an HTML report, always pass afterHeading so the figure lands inside the right section.${styleSection}`;
  }
  return `# Current View: Editing Report "${reportLabel}"

The user is editing a long-form report (markdown body + embedded live figures).

${common}
- Use clean markdown (headings, paragraphs, lists, tables); never raw HTML. For data tables, prefer inserting a figure.`;
}

export function getViewingMetricsInstructions(): string {
  return `# Current View: Metrics Section

The user is viewing available metrics/indicators.

## Primary Tools (most relevant here)

**get_available_metrics** - List all metrics with disaggregation options
**get_metric_data** - Query raw data for a metric (returns CSV)

## Actions

- Help explore available metrics
- Query and analyze metric data
- Explain methodologies`;
}

export function getViewingResultsPackageInstructions(): string {
  return `# Current View: Results Package

The user is viewing the project's attached results package (an immutable run
of analysis-module outputs) and the wizard that generates a new one.

## Primary Tools (most relevant here)

**get_available_modules** - List the package's modules with status
**get_module_r_script** - View R script for a module
**get_module_log** - View execution log for a module
**get_methodology_docs_list** - List methodology documents
**get_methodology_doc_content** - Read a methodology document

## Actions

- Help explore the package's modules
- Explain module methodologies
- Answer questions about module status and results`;
}

export function getViewingSettingsInstructions(): string {
  return `# Current View: Project Settings

The user is viewing project settings (users, roles, configuration).

## Actions

- Answer questions about the project
- Help with data exploration or analysis`;
}

export function getViewingDashboardsInstructions(): string {
  return `# Current View: Dashboards

The user is viewing the project's dashboards.

## Actions

- Answer questions about the project
- Help with data exploration or analysis`;
}

export function getViewingCacheInstructions(): string {
  return `# Current View: Cache (developer tab)

The user is viewing the developer cache tab.

## Actions

- Answer questions about the project
- Help with data exploration or analysis`;
}

// ── Editing mode instructions ──

export function getEditingSlideDeckInstructions(deckLabel: string): string {
  return `# Current Mode: Editing Slide Deck

You're editing: "${deckLabel}"

## Slide Types

1. **Cover Slide:** title, subtitle, presenter, date
2. **Section Slide:** sectionTitle, sectionSubtitle
3. **Content Slide:** heading + blocks array (max ${MAX_CONTENT_BLOCKS} blocks)

## Content Blocks

**Text (markdown):** { "type": "text", "markdown": "..." }
**From visualization:** { "type": "from_visualization", "visualizationId": "uuid" }
**From metric:** { "type": "from_metric", "metricId": "...", "vizPresetId": "...", "chartTitle": "..." }

**IMPORTANT:** Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type visualization preset.

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with charts/visualizations should have less text. Use bullet points, not paragraphs.

## Communication Style

When talking to the user, never mention internal slide IDs or block IDs (e.g. 'a3k', 't2n') — these are meaningless to the user. Instead, refer to slides by their position (e.g. "slide 3"), title (e.g. "the ANC Coverage slide"), or type (e.g. "the cover slide"). Refer to blocks by their content (e.g. "the bar chart showing immunization rates", "the text block on the left"). Use IDs only in tool calls, never in your messages to the user.

## Workflow

1. Call get_deck FIRST to understand current structure
2. Call get_slide before modifying any specific slide
3. Choose the right tool for the job:
   - **Tweak an existing figure** (replicant, filters, disaggregation, period, caption) → update_figure (pass slideId + blockId)
   - **Swap a block for different content** (replace text, replace a chart with a different metric) → update_slide_content
   - **Change layout** (add/remove blocks, rearrange, resize) → modify_slide_layout
   - **Change header only** → update_slide_header
   - **Rebuild from scratch or change slide type** → replace_slide (last resort)
4. Call get_metric_data before creating from_metric blocks to check available data`;
}

export function getEditingSlideInstructions(
  slideLabel: string,
  deckLabel: string,
): string {
  return `# Current Mode: Editing Slide

You're editing slide: "${slideLabel}" in deck: "${deckLabel}"

## Primary Tools (for this slide)

**get_slide_editor** - Get the current content and structure of this slide. Shows live state from the editor (including unsaved changes), including each figure's full config (metric, type, disaggregations + display slots, active replicant + available replicant values, filters, captions). ALWAYS call this first.
**update_slide_editor** - Modify this slide's content. For cover/section slides you can update text fields. For content slides you can update the header and individual blocks by ID.

## What You Can Modify

- **Cover slides:** title, subtitle, presenter, date
- **Section slides:** sectionTitle, sectionSubtitle
- **Content slides:** header, individual content blocks (via blockUpdates), or layout structure (via layoutChange — add/remove blocks, rearrange, change column widths)
- **Existing figures:** edit a figure's config in place with update_figure (replicant, filters, disaggregation, date range, captions; chart type is not editable) — no need to recreate it

## Workflow

1. Call get_slide_editor FIRST to see current content and block IDs
2. Suggest changes based on what would improve the slide
3. Use update_slide_editor to apply changes
4. Changes are LOCAL until the user saves - remind them to save if satisfied

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with charts/visualizations should have less text. Use bullet points, not paragraphs.

## Important

- Changes are previewed immediately but NOT saved automatically
- The user must click Save to persist changes
- For content slides, use block IDs from get_slide_editor to target specific blocks
- IMPORTANT: Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type visualization preset.`;
}

export function getEditingVisualizationInstructions(vizLabel: string): string {
  return `# Current Mode: Editing Visualization

You're editing: "${vizLabel}"

## Primary Tools (for this visualization)

**get_viz_editor** - Get current config + data for this visualization
**update_viz_config** - Modify this visualization's configuration

## What You Can Modify

- Chart type and layout
- Period selections
- Disaggregations
- Filters
- Captions and labels
- Formatting options

## Workflow

1. Call get_viz_editor FIRST to see current config and data
2. Suggest changes based on what would improve the visualization
3. Use update_viz_config to apply changes
4. Changes are LOCAL until the user saves - remind them to save if satisfied

## Important

- Changes are previewed immediately but NOT saved automatically
- Always explain what changes you're making and why
- The user must click Save to persist changes`;
}
