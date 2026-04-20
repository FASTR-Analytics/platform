import { z } from "zod";
import type { Sql } from "postgres";
import {
  instanceConfigAdminAreaLabelsSchema,
  instanceConfigCountryIso3Schema,
  instanceConfigFacilityColumnsSchema,
  instanceConfigMaxAdminAreaSchema,
  metricAIDescriptionInstalled,
  moduleDefinitionInstalledSchema,
  presentationObjectConfigSchema,
  vizPresetInstalled,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";

// ============================================================================
// Startup validation sweep.
//
// Read-only audit that parses every schema-backed stored row against the
// current Zod schema (which runs the baked-in adapter via z.preprocess, then
// strict validation). Never re-saves.
//
// HARD GATE on boot. If any row fails validation, the sweep logs a full
// structured report and then throws — boot aborts, deploy fails loudly in
// ops logs, zero user impact. Fix the underlying data (extend the adapter,
// run a Pattern 4 migration, or hand-fix the row) then redeploy.
//
// Opt-in via VALIDATE_ON_STARTUP=true so it doesn't slow local-dev boot
// and doesn't block developers working on legacy-shape data. Recommended
// ON in all production and staging environments.
//
// Paired with runtime strict parsing (see parsePresentationObjectConfig
// et al. — every DB read uses the strict schema). The sweep catches drift
// at deploy time as a batch; runtime strict catches anything that slips
// past the sweep (new edge cases, future bugs). Defense in depth at two
// different times.
// ============================================================================

const SHOULD_RUN = Deno.env.get("VALIDATE_ON_STARTUP") === "true";

type Issue = {
  scope: "instance" | "project";
  project?: string;
  table: string;
  rowId: string;
  issues: string;
};

function formatZodError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return err.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

export async function validateStoredDataOnStartup(sqlMain: Sql): Promise<void> {
  if (!SHOULD_RUN) return;

  const startedAt = Date.now();
  const issues: Issue[] = [];
  let rowsScanned = 0;

  // ── Instance configs (main DB) ──────────────────────────────────────
  const INSTANCE_CONFIG_SCHEMAS: Record<string, z.ZodSchema> = {
    max_admin_area: instanceConfigMaxAdminAreaSchema,
    facility_columns: instanceConfigFacilityColumnsSchema,
    country_iso3: instanceConfigCountryIso3Schema,
    admin_area_labels: instanceConfigAdminAreaLabelsSchema,
  };
  const configs = await sqlMain<
    { config_key: string; config_json_value: string }[]
  >`SELECT config_key, config_json_value FROM instance_config`;
  for (const c of configs) {
    const schema = INSTANCE_CONFIG_SCHEMAS[c.config_key];
    if (!schema) continue;
    rowsScanned++;
    try {
      schema.parse(JSON.parse(c.config_json_value));
    } catch (e) {
      issues.push({
        scope: "instance",
        table: "instance_config",
        rowId: c.config_key,
        issues: formatZodError(e),
      });
    }
  }

  // ── Per-project DBs ─────────────────────────────────────────────────
  const projects = await sqlMain<{ id: string }[]>`SELECT id FROM projects`;
  for (const p of projects) {
    const projectDb = getPgConnectionFromCacheOrNew(p.id, "READ_AND_WRITE");

    // modules.module_definition
    const modules = await projectDb<
      { id: string; module_definition: string }[]
    >`SELECT id, module_definition FROM modules`;
    for (const m of modules) {
      rowsScanned++;
      try {
        moduleDefinitionInstalledSchema.parse(JSON.parse(m.module_definition));
      } catch (e) {
        issues.push({
          scope: "project",
          project: p.id,
          table: "modules.module_definition",
          rowId: m.id,
          issues: formatZodError(e),
        });
      }
    }

    // metrics.ai_description + metrics.viz_presets
    const metrics = await projectDb<
      {
        id: string;
        ai_description: string | null;
        viz_presets: string | null;
      }[]
    >`SELECT id, ai_description, viz_presets FROM metrics`;
    for (const m of metrics) {
      if (m.ai_description) {
        rowsScanned++;
        try {
          metricAIDescriptionInstalled.parse(JSON.parse(m.ai_description));
        } catch (e) {
          issues.push({
            scope: "project",
            project: p.id,
            table: "metrics.ai_description",
            rowId: m.id,
            issues: formatZodError(e),
          });
        }
      }
      if (m.viz_presets) {
        rowsScanned++;
        try {
          z.array(vizPresetInstalled).parse(JSON.parse(m.viz_presets));
        } catch (e) {
          issues.push({
            scope: "project",
            project: p.id,
            table: "metrics.viz_presets",
            rowId: m.id,
            issues: formatZodError(e),
          });
        }
      }
    }

    // presentation_objects.config
    // Strict parse — NOT the permissive helper. The sweep is the audit
    // path; it demands strict success. Runtime reads use the permissive
    // helper today (until PLAN_7 ships).
    const pos = await projectDb<
      { id: string; config: string }[]
    >`SELECT id, config FROM presentation_objects`;
    for (const po of pos) {
      rowsScanned++;
      try {
        presentationObjectConfigSchema.parse(JSON.parse(po.config));
      } catch (e) {
        issues.push({
          scope: "project",
          project: p.id,
          table: "presentation_objects.config",
          rowId: po.id,
          issues: formatZodError(e),
        });
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const elapsed = Date.now() - startedAt;
  console.log(
    `[validate] scanned ${rowsScanned} rows across ${projects.length} project(s) in ${elapsed}ms`,
  );
  if (issues.length === 0) {
    console.log(
      `[validate] no drift detected — all stored rows match current schemas`,
    );
    return;
  }

  // Log the full structured report first so it's visible even if the
  // throw truncates console output downstream.
  console.error(
    `[validate] ABORT: ${issues.length} drift issue(s) detected. Deploy blocked. Each issue below is an actionable pointer to a row that needs adapter extension or data fix:`,
  );
  for (const issue of issues) {
    console.error(`[validate]`, JSON.stringify(issue));
  }

  throw new Error(
    `Startup validation failed: ${issues.length} stored row(s) do not match current schemas. See [validate] log lines above for the full report.`,
  );
}
