// =============================================================================
// Report backbones (lib/types/report_backbone.ts): what the platform does with
// one. Pure functions, shared by the server, the editor and the AI:
//
//   reportBackboneTheme          the theme it names, when the engine knows it
//   reportBackbonePageLimits     the page map's bars it sets (FastrPageLimits)
//   reportBackboneAllowsPlain    whether a body with no blocks is its shape
//   applyReportBackboneHeader    its `:::report` line, written into a body
//   describeReportBackboneForBrief  the AI's "house style" section
// =============================================================================

import {
  FASTR_DEFAULT_PAGE_LIMITS,
  type FastrPageLimits,
  type FastrReportTheme,
  isFastrReportTheme,
  parseContainerFence,
  REPORT_FORGE_LANGUAGES,
  scanContainerLines,
  updateContainerFenceLine,
} from "../report-forge/engine/mod.ts";
import {
  REPORT_BACKBONE_HEADER_ATTRS,
  type ReportBackbone,
  type ReportBackboneFrequency,
} from "./types/report_backbone.ts";

export function reportBackboneTheme(
  b: ReportBackbone | undefined,
): FastrReportTheme | undefined {
  const t = b?.look.theme;
  return t !== undefined && isFastrReportTheme(t) ? t : undefined;
}

// The page map's bars for a report written to this backbone. Only what the
// backbone says moves: a report whose pages are meant to stand part empty
// (one chart and a short analysis a page) is held to its own fill, never
// above the defaults; a backbone that names the words a chart needs sets
// that; one that uses no blocks is not told its pages are walls of prose.
export function reportBackbonePageLimits(
  b: ReportBackbone | undefined,
): Partial<FastrPageLimits> {
  if (b === undefined) return {};
  const out: Partial<FastrPageLimits> = {};
  const fill = b.length?.minPageFill;
  if (fill !== undefined) {
    const d = FASTR_DEFAULT_PAGE_LIMITS;
    out.shortShare = Math.min(d.shortShare, fill);
    out.breakShortShare = Math.min(d.breakShortShare, fill);
    out.holeShare = Math.min(d.holeShare, Math.max(0.1, fill - 0.15));
  }
  const perFigure = b.length?.wordsPerFigure;
  if (perFigure !== undefined) out.figureMinProseWords = perFigure;
  if (reportBackboneAllowsPlain(b)) out.plainShare = 1.01;
  return out;
}

// A backbone whose blocks are all never or rare, and whose templates are too,
// writes reports of headings, prose, figures and tables: the format's "no
// blocks" refusal is not its business.
export function reportBackboneAllowsPlain(
  b: ReportBackbone | undefined,
): boolean {
  if (b === undefined) return false;
  const quiet = (f: ReportBackboneFrequency | undefined) =>
    f === "never" || f === "rare";
  const widgets = Object.values(b.widgets ?? {});
  return widgets.length > 0 && widgets.every(quiet) &&
    (b.templates?.use === undefined || quiet(b.templates.use));
}

// The `:::report` attributes the backbone sets, numbering included.
export function reportBackboneHeaderAttrs(
  b: ReportBackbone,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of REPORT_BACKBONE_HEADER_ATTRS) {
    const v = b.look.report?.[k];
    if (v !== undefined && v.trim().length > 0) out[k] = v.trim();
  }
  if (b.structure?.numberedSections === true) out.numbering = "sections";
  // The labels it prints ("Tableau 2 :", "Source :") follow the language it
  // is written in, whatever the reader's interface is set to.
  const lang = b.voice?.language;
  if (
    out.lang === undefined && lang !== undefined &&
    (REPORT_FORGE_LANGUAGES as readonly string[]).includes(lang)
  ) out.lang = lang;
  return out;
}

// The body with the backbone's `:::report` attributes: the existing header
// line patched (other attributes kept), or a header line put first. A body
// that already says what the backbone says comes back unchanged.
export function applyReportBackboneHeader(
  body: string,
  b: ReportBackbone,
): string {
  const attrs = reportBackboneHeaderAttrs(b);
  if (Object.keys(attrs).length === 0) return body;
  const lines = body.split("\n");
  for (const { index, inCode, fence } of scanContainerLines(lines)) {
    if (inCode || fence?.kind !== "open" || fence.name !== "report") continue;
    const next = updateContainerFenceLine(lines[index], attrs);
    if (next === undefined || next === lines[index]) return body;
    lines[index] = next;
    return lines.join("\n");
  }
  const header = updateContainerFenceLine(":::report", attrs) ?? ":::report";
  // A header with no attributes still parses as the header.
  if (parseContainerFence(header)?.kind !== "open") return body;
  return body.trim().length === 0 ? `${header}\n` : `${header}\n\n${body}`;
}

const FREQUENCY_WORDS: Record<ReportBackboneFrequency, string> = {
  never: "never",
  rare: "at most once or twice in the report",
  normal: "where it earns its place",
  often: "freely, wherever it fits",
};

const CHART_WORDS: Record<string, string> = {
  chart: "bar charts",
  table: "tables",
  timeseries: "line charts over time",
  map: "maps",
  pie: "pie charts",
};

// The "house style" section of the report AI's brief. It is written as
// instructions that OVERRIDE the format guide's defaults where the two
// differ, and says so: the guide's composition advice (templates, bands,
// contents, page fill, words per chart) is a default for reports with no
// backbone, and this report has one.
export function describeReportBackboneForBrief(
  label: string,
  b: ReportBackbone,
): string {
  const out: string[] = [];
  out.push(`## This report's house style: "${label}"

This report is written to a REPORT BACKBONE, a house style taken from an example report. Follow it in every draft and edit. Where it differs from the format guide's advice on composing a report (cover layout, templates, bands, a contents page, how full a page is, how many words a chart needs, numbered headings, page furniture), THE HOUSE STYLE WINS. It never changes the format's syntax.`);

  const header = reportBackboneHeaderAttrs(b);
  if (Object.keys(header).length > 0) {
    const tokens = /\{(Place|Period|Year|Issue)\}/.test(
        `${header.header ?? ""}${header.footer ?? ""}`,
      )
      ? " Replace the {Place}, {Period}, {Year} and {Issue} tokens in its text with this report's own place, period, year and issue number; keep everything else as written."
      : "";
    out.push(
      `**The report header.** Keep the \`:::report\` line first in the body with these attributes (the user picked them with the backbone; never drop them): ${
        Object.entries(header).map(([k, v]) =>
          /[\s"]/.test(v) ? `${k}="${v.replaceAll('"', "'")}"` : `${k}=${v}`
        ).join(" ")
      }.${tokens}`,
    );
  }

  const c = b.cover;
  if (c !== undefined) {
    const parts: string[] = [];
    if (c.layout) parts.push(`\`layout=${c.layout}\``);
    if (c.tone === "default") {
      parts.push("`tone=default` (the plain white page: never ink)");
    } else if (c.tone) parts.push(`\`tone=${c.tone}\``);
    if (c.fill) parts.push("`fill=page` (a title page of its own)");
    if (c.boxColor && c.layout === "bulletin") {
      parts.push(`\`boxcolor="${c.boxColor}"\` (its title box and strip)`);
    }
    parts.push(
      c.kicker
        ? `a kicker like "${c.kicker}"`
        : "NO kicker (whatever the guide says about always giving one)",
    );
    if (c.sub) parts.push(`a sub like "${c.sub}"`);
    if (c.issue) parts.push(`an issue line like "${c.issue}"`);
    if (c.date) parts.push(`a date line like "${c.date}"`);
    let cover = `**The cover.** Open with a \`:::cover\`: ${parts.join(", ")}.`;
    if (c.masthead !== undefined && c.masthead.length > 0) {
      cover +=
        ` Inside it, before its title, put a \`:::logos\` line (left without sources: the user adds the logos), then these ministry lines, one per line, word for word: ${
          c.masthead.map((l) => `"${l}"`).join(" / ")
        }.`;
    } else if ((c.logoSlots ?? 0) > 0) {
      cover +=
        " Inside it, before its title, leave a `:::logos` line without sources: the user adds the logos.";
    }
    if (c.upperTitle) cover += " Write the title in CAPITALS.";
    cover +=
      " Fill each like-this text with this report's own words (its place, period, number).";
    out.push(cover);
  }

  if (b.signoff !== undefined && b.signoff.labels.length > 0) {
    out.push(
      `**The close.** End with a \`:::signoff\`${
        b.signoff.right ? "{align=right}" : ""
      } holding one \`:::signer\` for each of ${
        b.signoff.labels.map((l) => `"${l}"`).join(", ")
      }, each with **Name** and Role as placeholders for the user to fill: never invent a name. No heading over it, and no place or date unless the user gives them.`,
    );
  }

  const len = b.length;
  if (len !== undefined) {
    const parts: string[] = [];
    if (len.pagesMin !== undefined || len.pagesMax !== undefined) {
      parts.push(
        `about ${len.pagesMin ?? len.pagesMax} to ${
          len.pagesMax ?? len.pagesMin
        } pages unless the user asks for another length`,
      );
    }
    if (len.wordsPerPage !== undefined) {
      parts.push(`about ${len.wordsPerPage} words of prose on a typical page`);
    }
    if (len.wordsPerFigure !== undefined) {
      parts.push(
        `about ${len.wordsPerFigure} words that read each chart (this replaces the guide's 120)`,
      );
    }
    if (len.minPageFill !== undefined) {
      parts.push(
        `pages may stand part empty: a page filled to ${
          Math.round(len.minPageFill * 100)
        }% is this style's normal, not a hole to fill`,
      );
    }
    if (parts.length > 0) out.push(`**Length.** ${cap(parts.join("; "))}.`);
  }

  const s = b.structure;
  if (s !== undefined) {
    const parts: string[] = [];
    if (s.outline !== undefined && s.outline.length > 0) {
      parts.push(
        `Its usual outline, which is the default plan for a new report here (the user's request decides the subject; adapt the sections to it, and agree them with the user as usual):\n${
          s.outline.map((o, k) =>
            `  ${k + 1}. ${o.role}: ${o.purpose}${
              o.repeat ? " (repeated for each indicator or topic)" : ""
            }`
          ).join("\n")
        }`,
      );
    }
    if (s.numberedSections === true) {
      parts.push("Its sections are numbered (`numbering=sections`).");
    }
    if (s.headingDepth !== undefined) {
      parts.push(`It uses headings down to level ${s.headingDepth}.`);
    }
    if (s.oneFigurePerSection === true) {
      parts.push(
        "Each section holds one figure or table and the analysis of it.",
      );
    }
    if (s.figureLeadIn) {
      parts.push(
        `The paragraph after each figure opens with the bold lead-in \`**${s.figureLeadIn}**\`.`,
      );
    }
    if (s.headings === false) {
      parts.push(
        "It has NO section headings: write no `#` or `##` heading in the body. Each figure's caption is its section's title, so a section is the figure line (its caption, the chart, the source) followed by its analysis paragraph, and the next figure follows straight on. The outline above is the ORDER of the figures, not headings to write.",
      );
    }
    if (s.introduction === false) {
      parts.push(
        "It has no introduction: the first figure follows the cover.",
      );
    }
    if (s.conclusion === false) {
      parts.push(
        "It has no conclusion or recommendations section: the last analysis is followed by the sign-off (or ends the report).",
      );
    }
    if (s.figureIntro === false) {
      parts.push(
        'No sentence announces a figure before it ("The chart below shows…"): the caption introduces it.',
      );
    }
    if (s.justified === true) {
      parts.push(
        "Its body text is justified: end every prose paragraph's last line with ` {align=justify}`.",
      );
    }
    if (parts.length > 0) out.push(`**Structure.** ${parts.join("\n")}`);
  }

  const t = b.templates;
  if (t?.use !== undefined) {
    out.push(
      t.use === "never"
        ? "**Page templates.** Use none (ignore the guide's one page in three)."
        : `**Page templates.** Use them ${FREQUENCY_WORDS[t.use]}${
          t.layouts !== undefined && t.layouts.length > 0
            ? `; prefer ${t.layouts.map((l) => `\`${l}\``).join(", ")}`
            : ""
        }.`,
    );
  }

  const w = b.widgets;
  if (w !== undefined && Object.keys(w).length > 0) {
    out.push(
      `**Blocks.** ${
        Object.entries(w).filter(([name]) => name !== "masthead").map((
          [name, f],
        ) => `\`${name}\` ${FREQUENCY_WORDS[f as ReportBackboneFrequency]}`)
          .join("; ")
      }. A block not listed keeps the guide's advice.`,
    );
  }

  const ch = b.charts;
  if (ch !== undefined) {
    const parts: string[] = [];
    if (ch.preferred !== undefined && ch.preferred.length > 0) {
      parts.push(
        `prefer ${
          ch.preferred.map((p) => CHART_WORDS[p] ?? p).join(", then ")
        } (each preset in get_available_metrics names its type)`,
      );
    }
    if (ch.breakdown) {
      parts.push(`broken down ${ch.breakdown} where the data allows`);
    }
    if (ch.comparison === "same_period_last_year") {
      parts.push("compared with the same period a year earlier");
    } else if (ch.comparison === "trend") {
      parts.push("shown as a trend over recent periods");
    }
    if (ch.approximated !== undefined && ch.approximated.length > 0) {
      parts.push(
        `the example also draws ${
          ch.approximated.join("; ")
        }, which the platform cannot: use the nearest preset and do not mention it`,
      );
    }
    if (parts.length > 0) out.push(`**Charts.** ${cap(parts.join("; "))}.`);
  }

  const v = b.voice;
  if (v !== undefined) {
    const parts: string[] = [];
    if (v.language) {
      parts.push(
        `Write the report in the language "${v.language}" (headings, captions, analysis and every block's text), whatever language the conversation is in.`,
      );
    }
    if (v.register === "formal") {
      parts.push("Formal, institutional register.");
    } else if (v.register === "plain") {
      parts.push("Plain, direct register.");
    } else if (v.register === "technical") {
      parts.push("Technical register, for specialists.");
    }
    if (v.notes) parts.push(v.notes.trim());
    if (parts.length > 0) out.push(`**Voice.** ${parts.join(" ")}`);
  }

  return out.join("\n\n");
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
