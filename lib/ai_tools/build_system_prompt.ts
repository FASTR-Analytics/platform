import { getCountryLabel } from "../consts.ts";
import type { DatasetInProject } from "../types/datasets_in_project.ts";
import type { InstanceState } from "../types/instance_sse.ts";
import type { InstanceCalendar } from "../types/instance.ts";
import type { PeriodBounds } from "../types/presentation_objects.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import type { InfoCatalogTopic } from "./info_catalog.ts";

// The shared halves of the AI system prompt — what both surfaces (the SPA
// copilot and the /mcp get_overview) ground the model with. Each surface
// assembles its own context section from these building blocks and its own
// prose (the SPA: the project's name, viz/deck/report counts, aiContext —
// client/src/components/project_ai/build_system_prompt.ts; /mcp: the pinned
// package — server/mcp/mcp_tools.ts), then hands it to buildSystemPrompt.
//
// The SPA's assembled prompt is BYTE-STABLE across navigation (per-view
// instructions ride each view's instructions in ai_views.ts as an ephemeral
// section, never baked in here) — the prompt-cache breakpoint depends on it.

export type SystemPromptParts = {
  contextSection: string;
  toolCatalog: string;
  // The get_info topics THIS surface exposes — the same list its
  // getSharedToolsForInfo was built with, so the prompt never names a topic
  // the tool would refuse.
  infoTopics: InfoCatalogTopic[];
  // "# Role and Purpose" body — what THIS surface's assistant is for.
  roleAndPurpose: string;
  // Core principles this surface adds after the four shared ones (the SPA
  // adds "ask when uncertain" — the ask_user_questions tool exists only
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
// manifest (the pinned package on /mcp) — the caller maps to this shape.

export type PackageGrounding = {
  // The calendar the package's period ids are in — a package fact, captured
  // into the run manifest at finalize (`manifest.calendar`, never the env
  // global). The SPA's attached package was generated on this instance, so it
  // passes the instance calendar.
  calendar: InstanceCalendar;
  datasets: DatasetInProject[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string }[];
  // The package's overall period range at its finest time grain (null = no
  // time-indexed results). Omitted when the caller cannot know it — the SPA
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
