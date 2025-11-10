import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import { PresentationObjectConfig, ReportConfig } from "./types/mod.ts";

export function cleanValStrForSql(str: string | undefined): string {
  return (
    str?.replaceAll('"', "").replaceAll("'", "").replaceAll(",", "").trim() ??
    ""
  );
}

export function withReplicant(
  str: string,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>
): string {
  const replicateBy = getReplicateByProp(config);
  if (config && !replicateBy) {
    return str;
  }
  if (config.d.selectedReplicantValue === undefined) {
    return str
      .replaceAll("REPLICANT", "Unselected")
      .replaceAll("RÉPLICANT", "Unselected");
  }
  if (replicateBy === "indicator_common_id") {
    return str
      .replaceAll(
        "REPLICANT",
        indicatorLabelReplacements[config.d.selectedReplicantValue] ??
          config.d.selectedReplicantValue
      )
      .replaceAll(
        "RÉPLICANT",
        indicatorLabelReplacements[config.d.selectedReplicantValue] ??
          config.d.selectedReplicantValue
      );
  }
  return str
    .replaceAll("REPLICANT", config.d.selectedReplicantValue)
    .replaceAll("RÉPLICANT", config.d.selectedReplicantValue);
}

export function withReplicantForReport(
  str: string,
  config: ReportConfig
): string {
  if (!config.selectedReplicantValue) {
    return str;
  }
  return str
    .replaceAll("REPLICANT", config.selectedReplicantValue ?? "Unselected")
    .replaceAll("RÉPLICANT", config.selectedReplicantValue ?? "Unselected");
}

export function encodeRawCsvHeader(
  i_colHeader: number,
  colHeader: string
): string {
  return `Col ${i_colHeader + 1}: ${colHeader}`;
}

export function parseJsonOrUndefined<T>(
  str: string | null | undefined
): T | undefined {
  if (!str) {
    return undefined;
  }
  try {
    return JSON.parse(str) as T;
  } catch {
    return undefined;
  }
}

export function parseJsonOrThrow<T>(str: string): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    throw new Error("Could not parse JSON: " + str.slice(0, 10) + "...");
  }
}
