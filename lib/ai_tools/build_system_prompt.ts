import { getCountryLabel } from "../consts.ts";
import type { DatasetInProject } from "../types/datasets_in_project.ts";
import type { InstanceState } from "../types/instance_sse.ts";
import type { InstanceCalendar } from "../types/instance.ts";
import type { PeriodBounds } from "../types/presentation_objects.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import type { InfoCatalogTopic } from "./info_catalog.ts";
import type { ReportFormat, ReportHtmlStyle } from "../types/reports.ts";
import { FASTR_MD_SYNTAX_DOC } from "../fastr_markdown_spec.ts";

// The shared halves of the AI system prompt: what both surfaces (the SPA
// copilot and the /mcp get_overview) ground the model with. Each surface
// assembles its own context section from these building blocks and its own
// prose (the SPA: the project's name, viz/deck/report counts, aiContext:
// client/src/components/project_ai/build_system_prompt.ts; /mcp: the pinned
// package: server/mcp/mcp_tools.ts), then hands it to buildSystemPrompt.
//
// The SPA's assembled prompt is BYTE-STABLE across navigation (per-view
// instructions ride each view's instructions in ai_views.ts as an ephemeral
// section, never baked in here): the prompt-cache breakpoint depends on it.

export type SystemPromptParts = {
  contextSection: string;
  toolCatalog: string;
  // The get_info topics THIS surface exposes: the same list its
  // getSharedToolsForInfo was built with, so the prompt never names a topic
  // the tool would refuse.
  infoTopics: InfoCatalogTopic[];
  // "# Role and Purpose" body: what THIS surface's assistant is for.
  roleAndPurpose: string;
  // Core principles this surface adds after the four shared ones (the SPA
  // adds "ask when uncertain": the ask_user_questions tool exists only
  // there).
  extraCorePrinciples: string[];
};

export function buildSystemPrompt(parts: SystemPromptParts): string {
  const currentDate = new Date().toISOString().split("T")[0];
  const dateHeader = `**CURRENT DATE: ${currentDate}**\n\n---\n\n`;
  const referenceDocsSection = buildReferenceDocsSection(parts.infoTopics);
  const baseInstructions = getBaseInstructions(
    parts.roleAndPurpose,
    parts.extraCorePrinciples,
  );
  const toolsSection = `\n# Available Tools\n\n${parts.toolCatalog}\n`;
  return `${dateHeader}${parts.contextSection}${referenceDocsSection}${baseInstructions}${toolsSection}`;
}

// ── Reference documentation catalog ──

function buildReferenceDocsSection(topics: InfoCatalogTopic[]): string {
  if (topics.length === 0) return "";
  const sections: string[] = [];
  sections.push("# Reference documentation");
  sections.push("");
  sections.push(
    "Authoritative reference docs you can load on demand with the **get_info** tool. When a task relates to one of these topics, call get_info for that topic FIRST and follow it.",
  );
  sections.push("");
  for (const t of topics) {
    sections.push(`- **${t.topic}** — ${t.title}: ${t.description}`);
  }
  sections.push("");
  return sections.join("\n");
}

// ── Instance grounding: country, terminology, data sources ──

export function buildInstanceContextSections(instance: InstanceState): string[] {
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
  // Depth is per facility registry; the shared level labels apply to both.
  const hmisDepth = instance.structureSchemaHmis?.adminDepth;
  const hfaDepth = instance.structureSchemaHfa?.adminDepth;
  const maxAdminArea = Math.max(hmisDepth ?? 1, hfaDepth ?? 1);
  if (maxAdminArea >= 2) {
    const aa = maxAdminArea;
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
    if (
      hmisDepth !== undefined && hfaDepth !== undefined &&
      hmisDepth !== hfaDepth
    ) {
      sections.push(
        `- The HMIS facility registry uses levels down to admin_area_${hmisDepth}; the HFA registry down to admin_area_${hfaDepth}. Each registry's data only carries its own levels.`,
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
  return sections;
}

// ── Package grounding: what ONE results package holds ──
//
// Derivable from either a project's state (its attached package) or a run
// manifest (the pinned package on /mcp): the caller maps to this shape.

export type PackageGrounding = {
  // The calendar the package's period ids are in: a package fact, captured
  // into the run manifest at finalize (`manifest.calendar`, never the env
  // global). The SPA's attached package was generated on this instance, so it
  // passes the instance calendar.
  calendar: InstanceCalendar;
  datasets: DatasetInProject[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string }[];
  // The package's overall period range at its finest time grain (null = no
  // time-indexed results). Omitted when the caller cannot know it: the SPA
  // holds no manifest client-side; /mcp reads it from the manifest.
  periodCoverage?: PeriodBounds | null;
};

export function buildPackageGroundingSections(
  grounding: PackageGrounding,
): string[] {
  const sections: string[] = [];
  sections.push("");
  sections.push(
    `**Calendar:** ${grounding.calendar} (period ids like 202503 are year+month in this calendar)`,
  );
  const hmisDataset = grounding.datasets.find(
    (d) => d.datasetType === "hmis",
  );
  const hfaDataset = grounding.datasets.find(
    (d) => d.datasetType === "hfa",
  );
  const icehDataset = grounding.datasets.find(
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

  if (grounding.commonIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**Common indicators (${grounding.commonIndicators.length}):**`,
    );
    for (const ind of grounding.commonIndicators) {
      sections.push(`- ${ind.id}: ${ind.label}`);
    }
  }

  if (grounding.icehIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**ICEH indicators (${grounding.icehIndicators.length}):**`,
    );
    for (const ind of grounding.icehIndicators) {
      sections.push(`- ${ind.id}: ${ind.label}`);
    }
  }

  if (grounding.periodCoverage !== undefined) {
    sections.push("");
    sections.push(
      grounding.periodCoverage === null
        ? "**Period coverage:** no time-indexed results"
        : `**Period coverage:** ${
          inferPeriodFormatFromValue(grounding.periodCoverage.min) ?? "unknown"
        } ${grounding.periodCoverage.min} to ${grounding.periodCoverage.max} (the range of the package's finest-grained results; coarser-grained results may reach further — each metric states its own in get_metric_data)`,
    );
  }
  return sections;
}

// ── Data coverage: the instance's facility registries ──

export function buildDataCoverageSections(instance: InstanceState): string[] {
  const sections: string[] = [];
  if (instance.structure) {
    sections.push("");
    sections.push("**Data coverage:**");
    sections.push(
      `- ${instance.structure.hmis.facilities} HMIS facilities, ${instance.structure.hfa.facilities} HFA facilities`,
    );
    for (
      const [familyLabel, counts, familyDepth] of [
        ["HMIS", instance.structure.hmis, instance.structureSchemaHmis?.adminDepth],
        ["HFA", instance.structure.hfa, instance.structureSchemaHfa?.adminDepth],
      ] as const
    ) {
      if (counts.facilities === 0) continue;
      // Storage is always four levels: staging pads every level above the
      // family's depth with the leaf value, so a depth-2 registry's level-3
      // rows are a 1:1 mirror of its level-2 rows. Reporting them would tell
      // the copilot a level-2 registry has AA3s and invite breakdowns on a
      // column its results objects do not carry.
      const depth = familyDepth ?? 4;
      const parts: string[] = [];
      if (depth >= 2 && counts.adminArea2s > 0) {
        parts.push(`${counts.adminArea2s} admin area 2s`);
      }
      if (depth >= 3 && counts.adminArea3s > 0) {
        parts.push(`${counts.adminArea3s} admin area 3s`);
      }
      if (parts.length > 0) {
        sections.push(`- ${familyLabel} registry: ${parts.join(", ")}`);
      }
    }
  }
  return sections;
}

// ── Base instructions ──

function getBaseInstructions(
  roleAndPurpose: string,
  extraCorePrinciples: string[],
): string {
  const principles = [
    "**CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims",
    "**Never fabricate statistics** - Only report what you've verified from the data",
    "**Acknowledge limitations** - Be clear about data gaps or quality issues",
    "**Be concise** - Keep explanations actionable and to the point",
    ...extraCorePrinciples,
  ].map((p, i) => `${i + 1}. ${p}`).join("\n");
  return `
# Role and Purpose

${roleAndPurpose}

# Core Principles

${principles}

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

// ── Report authoring briefs ──
// The per-view instructions live with the SPA (client/src/components/
// project_ai/build_system_prompt.ts); the report EDITING brief stays here
// because its style presets are also read by the report style editor
// (REPORT_STYLE_BRIEFS, via lib) and covered by the server test suite.

// Styled html presets (chosen on the Create-report form, stored in config,
// fixed at creation): each is a prescriptive design language the model writes
// its own stylesheet from, so successive rewrites come out consistent. They
// are briefs, not CSS dumps, and they only ever say things the sanitizer
// allows (fonts via @import — <link> is stripped; static markup — <script> is
// stripped). The shared constraints ride once at the end of every brief.

type StyledReportStyle = Exclude<ReportHtmlStyle, "default">;

const REPORT_STYLE_SHARED_CONSTRAINTS =
  `**Hard constraints (every style)**: static markup only — no <script> (stripped; do NOT emit JS-built content) and no <link> (load fonts via @import inside the <style> block). Inline <svg> is allowed for ornament and small sparklines. Close every element; prefix ids (sec-…). Responsive via auto-fit grids or a single column; break-inside:avoid on cards and figures for print. Figure embeds render as TRANSPARENT PNG <img>s that keep your class/style/id — whatever your design paints behind them (page color, texture, panel) shows through automatically, and the chart's text/axes ink adapts to that ground on its own (dark ink on light grounds, light ink on dark grounds) — so place figures on whatever background suits the design; set a background on the figure only when you want a distinct card.`;

export const REPORT_STYLE_BRIEFS: Record<
  StyledReportStyle,
  { name: string; brief: string }
> = {
  minimal: {
    name: "Minimal",
    brief:
      `Modern minimal document — generous whitespace, hairline dividers, no boxes. The quiet default for professional reports.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'); everything 'Inter' — 700 for h1, 600 for h2/h3, 400 body. Tabular figures for numbers.

**Palette**: white #FFFFFF page, ink #1B2430, secondary #5C6672, hairlines #E5E8EC, one restrained accent: slate blue #3B5B7E for links, small labels and key numbers. No fills, no shadows, no border-radius ornamentation.

**Structure**: no masthead band — a plain title block (h1 ~34px, a one-line grey standfirst, a hairline below); h2s ~20px with 40px of space above and a 1px hairline underneath; body ≤70ch; generous spacing everywhere (this style is 60% whitespace); lists with normal bullets; data tables with hairline row rules only, no vertical rules, right-set tabular numerals, bold header row without background; a small grey sources line at the end under a hairline.

**Figures**: unframed — the figure sits on the white page with a hairline rule above and a small grey caption below. Let space do the framing.`,
  },
  corporate: {
    name: "Corporate",
    brief:
      `Clean corporate briefing — the consultancy/World-Bank idiom: navy headings, KPI band, blue-ruled sections.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap'); everything 'Source Sans 3'.

**Palette**: white page, ink #222B36, navy #1F4E79 for headings, steel blue #2E75B6 for rules/accents, panel tint #EEF3F8, hairlines #D9E1E8. Optional semantic touches: green #2E7D4F / amber #B7791F / red #B23A3A for status only.

**Structure**: title block with the h1 in navy, a grey subtitle line, and a 3px steel-blue rule; then a KPI band — a row of 3-4 tiles (flex; tint #EEF3F8, 3px navy top border, big bold number over a small grey label); h2s ~20px navy with a 2px steel-blue underline across the column; short intro paragraph per section; key-findings as a bulleted list with bold lead-ins; data tables with a navy header row (white text), hairline body rules, right-set numerals; a bordered light panel for recommendations; grey source footer.

**Figures**: on a white panel with a 1px #D9E1E8 border and a 3px steel-blue top border, small grey caption underneath.`,
  },
  ministry: {
    name: "Ministry",
    brief:
      `Formal government document — centered title block, numbered sections, serif headings, fully-ruled tables. For reports that go on official letterhead.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,700&family=Source+Sans+3:wght@400;600&display=swap'); headings 'Source Serif 4', body 'Source Sans 3'.

**Palette**: white page, near-black ink #1A1A1A, deep navy #0F2B46 for headings and rules, grey #555 secondary, table rules #8A8A8A. Essentially two-color; no tints or panels.

**Structure**: CENTERED title block — an uppercase small-caps ministry/series line, the title in 'Source Serif 4' 700 (~30px), a date/reference line, all between thin double rules (1px + 1px with a 3px gap); NUMBERED h2s ("1. Introduction", "2. Findings" — write the numbers into the heading text) in serif, left-aligned, ~21px; formal paragraphs ≤75ch, justified is acceptable; tables fully ruled (1px #8A8A8A on every cell), serif bold header row, generous cell padding; numbered lists for recommendations; a final "Annex"/source section in smaller type under a single rule; page footer line with reference number in small caps.

**Figures**: centered, with a 1px full border and a serif caption below in the form "Figure 1. <caption>" — number the figures in order.`,
  },
  classic: {
    name: "Classic",
    brief:
      `Classic report typography — serif prose, numbered figures, footnoted sources. Reads like a well-set academic or agency report.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap'); everything 'Source Serif 4' (Georgia fallback).

**Palette**: white page, ink #2B2B2B, muted #666, rules #CCCCCC, and one sparing accent: deep maroon #7B2D26 for links, figure numbers and small-caps labels. Nothing else.

**Structure**: a book-like opening — small-caps series line, title at ~32px/700, author-date line in italic, a 1px rule; h2s ~22px/600 with space above, no rules or backgrounds; continuous readable prose at ≤68ch and 1.7 line-height — this style is prose-first, use fewer lists than usual; block quotes indented with a 2px #CCC left rule; tables lightly ruled (top + header + bottom, hairline rows), serif numerals; footnote-style sources at the end in smaller type under a short centered rule.

**Figures**: centered with a hairline top-and-bottom rule pair and a caption "Figure 1 — <caption>" in small italic, the number in maroon.`,
  },
  executive: {
    name: "Executive",
    brief:
      `Executive summary style — compact, decision-oriented: stat tiles up top, findings in tight columns, strong section bars. Built to be read in three minutes.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap'); 'Inter' — 800 for the title and stat numbers, 600 headings, 400 body at a compact 14.5px.

**Palette**: white page, slate ink #1E293B, secondary #64748B, rules #E2E8F0, accent teal #0E7490 with tint #E8F4F6; semantic green #15803D / amber #B45309 / red #B91C1C for status.

**Structure**: a slim header — small uppercase label, title ~26px/800, date right-aligned on the same line if room; immediately a stat-tile row (4-6 tiles: tint background, 2px teal left border, 26px/800 number, 11px grey label; semantic border colors for good/warn/bad tiles); h2s as section BARS — 13px uppercase 700 on a 3px teal left border, tight; content in short paragraphs and dense bulleted lists with bold lead-ins; a two-column grid (auto-fit minmax 300px) for parallel findings; a compact bordered "Actions" list with bold owners; everything tighter than normal — margins ~60% of typical.

**Figures**: small and inline with the flow — a 1px #E2E8F0 border, no padding luxury, caption as an 11px grey line. Prefer placing figures beside or between findings, not as full-width showpieces.`,
  },
  clinical: {
    name: "Clinical",
    brief:
      `Health-programme document — calm teal accents, callout panels, status pills. The WHO-adjacent look for clinical and public-health reporting.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap'); everything 'Public Sans'.

**Palette**: white page, ink #21303A, secondary #5B6B76, teal #0F766E for headings/accents, soft teal panel #E6F2F0, hairlines #DCE4E8; status colors green #2E7D4F, amber #B7791F, red #B23A3A with matching soft tints for pills.

**Structure**: title block with a 4px teal left border — title ~28px/700, a grey programme/period line; h2s ~19px teal with a hairline underneath; "Key messages" as a soft-teal panel (border-left 3px teal) containing a short bulleted list, placed before the detail; inline status PILLS — small rounded uppercase labels (soft tint background, dark text) like ADEQUATE / WATCH / ACTION next to findings; definition-style callouts as bordered panels for methods/caveats; tables with a teal-tinted header row, hairline rules, right-set numerals; a methods & caveats footer panel in smaller grey type.

**Figures**: on a white panel with a hairline border and a 3px teal top border, caption below with the source in grey; when a figure supports a specific finding, repeat that finding's status pill beside the caption.`,
  },
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
monochrome: {
    name: "Monochrome ink",
    brief:
      `Pure black on white. The figures' chart colors are the ONLY color on the page — that is the point.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@300;400;600;800;900&display=swap'); one family, 'Libre Franklin', doing everything through its weight range.

**Palette**: #000000 on #FFFFFF. Greys only as genuine secondary text (#666). No accent color anywhere — not in rules, badges, links (links are black, underlined). Zero.

**Devices**: hierarchy entirely from weight, size and space — hairline 300 for big standfirsts, 900 for headlines; solid black blocks with white knocked-out text for the masthead band and key stat callouts; heavy 4px black top rules opening each section, hairline rules inside; tables with a solid black header band (white text) and hairline rows; emphasis via weight jumps, never color; oversized black numerals for stats.

**Figures**: because they carry the page's only color, give them room — full-width, a 1px black frame, bold black caption line above ("Figure 2 — Penta1 coverage") and nothing competing nearby.`,
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

**Figures**: this is the signature move — each figure is a PLATE: a panel in the lighter blueprint blue #1B4A78 (give the figure <img> background: #1B4A78 in CSS; chart ink adapts to the dark ground automatically) inside a light border with corner ticks, labelled "FIG. 01 — <CAPTION>" in mono uppercase above or below.`,
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
terminal: {
    name: "Terminal",
    brief:
      `A phosphor terminal session: mono everything, green on near-black, CLI furniture.

**Fonts**: @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap'); EVERYTHING is 'JetBrains Mono' — headings included.

**Palette**: ground #0C0F0D, panels #121A15, phosphor green #33FF66 for headings/prompts/key values, dim green-grey #9BB39F for body text, borders #1E3A2A. Amber #FFB000 for warnings only. No white text.

**Devices**: section headers as commands — "$ fastr report --section coverage" in green, output following; or banner style "== 02 · COVERAGE ==" padded with = signs; 1px solid borders with a small label breaking the top edge (fieldset/legend idiom) to fake box-drawing frames; status tags in brackets — [OK] green, [WARN] amber, [FAIL] inverted; tables as aligned CLI output (mono makes columns line up; hairline row rules); key-value readouts as "metric ........: value" dot-leader lines; a blinking block cursor after the final line via a CSS keyframe animation.

**Figures**: dark "screenshot" cards matching the panel color #121A15 (give the figure <img> background: #121A15 in CSS; chart ink adapts to the dark ground automatically) with a slim terminal title bar above — a darker strip, green mono filename ("anc1_coverage.png"), three small circles left.`,
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

IMPORTANT — scoping: if these rules are scoped under a wrapper class (selectors like ".cs2 h2", ".report-x .panel"), you MUST wrap the entire report body in that wrapper element (e.g. <div class="cs2"> … </div>) or none of the styling will apply.

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
  if (format === "fastr") {
    // The inverse of the html branch: there, the model designs and the CSS is
    // its output. Here the design already exists as a real stylesheet the user
    // picked, so the model's job is to reach for the right BLOCK. Every
    // instinct to write CSS has to be shut down explicitly — the report has no
    // <style> for it to land in, and a hand-rolled <div> is unstyled markup.
    return `# Current View: Editing Report "${reportLabel}" (FASTR Markdown format)

The user is editing a long-form report written in **FASTR Markdown** — ordinary markdown plus a small set of \`:::\` blocks — with embedded live figures. The user hand-edits this document, so keep the source clean and readable.

**Whenever you write or restructure this report (rewrite_report, or a rewrite_section that adds new material), build it from the format's \`:::\` blocks** — open with a \`:::cover\` (choosing a \`layout\`), add a \`:::contents\` line when the report is long, put the headline numbers in a \`:::tiles\` row of \`:::stat\` blocks, mark the turning points with \`:::band\` — with the shape the "Composing a report" guidance below describes. Do this on the first write, without being asked: a plain run of headings and paragraphs wastes the format. Write plain only when the user asks for something plain.

${common}

## Writing FASTR Markdown for this report

${FASTR_MD_SYNTAX_DOC}

- The report already looks designed: its theme supplies the typography, palette and every block's appearance, and the user can switch themes at any time. Writing CSS or raw layout HTML would not just be redundant, it would be INERT and would break that switch. (Which theme is in use is the user's business, not yours — never name one or write for one.)
- Use the blocks where they earn their place — a callout for a caveat or key finding, a tiles row of stats for headline numbers, columns to set commentary beside a figure. Plain prose and lists are still the backbone of the document.
- **Sections** (rewrite_section, the headings index) are flat: a section runs from its \`#\` heading to the next heading of the same or higher level, and your newBody replaces that whole range starting with the heading. Only TOP-LEVEL headings are sections — a heading inside a \`:::\` block is not addressable, so keep headings outside blocks.
- For insert_figure, pass afterHeading so the figure lands in the right section.
- The report prints on pages, and the pages are the deliverable. Before proposing a rewrite_report, or a rewrite_section that changes what a page holds, call get_report_pages with the body as it would stand (the current body from get_report_editor with your section swapped in, as \`markdown\`) and fix every page it flags; the page budget is in the format guide above.`;
  }
  return `# Current View: Editing Report "${reportLabel}"

The user is editing a long-form report (markdown body + embedded live figures).

${common}
- Use clean markdown (headings, paragraphs, lists, tables); never raw HTML. For data tables, prefer inserting a figure.`;
}
