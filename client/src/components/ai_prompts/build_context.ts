import type { InstanceDetail, ProjectDetail } from "lib";

/**
 * Build structured context section for AI system prompts.
 * Includes instance metadata, project info, datasets, and user-provided context.
 */
export function buildAISystemContext(
  instanceDetail: InstanceDetail,
  projectDetail: ProjectDetail,
): string {
  const sections: string[] = [];

  // Instance information
  sections.push("# Instance Information");
  sections.push("");

  if (instanceDetail.countryIso3) {
    sections.push(`**Country:** ${instanceDetail.countryIso3}`);
  }

  sections.push(`**Instance:** ${instanceDetail.instanceName}`);
  sections.push("");

  // Terminology
  sections.push("# Terminology");
  sections.push("");
  sections.push("**Geographic levels:**");
  sections.push("- admin_area_1: National level");
  sections.push("- admin_area_2: Regional/provincial level (e.g., districts, regions)");
  sections.push("- admin_area_3: Sub-district level (e.g., zones, sub-districts)");
  sections.push("- admin_area_4: Facility catchment level (e.g., woredas, communes)");
  sections.push("");
  sections.push("**Data sources:**");
  sections.push("- HMIS: Health Management Information System (routine facility reporting)");
  sections.push("- HFA: Health Facility Assessment (facility survey data)");
  sections.push("");

  // Project information
  sections.push("# Project");
  sections.push("");
  sections.push(`**Name:** ${projectDetail.label}`);

  // Datasets
  const hmisDataset = projectDetail.projectDatasets.find(d => d.datasetType === "hmis");
  const hfaDataset = projectDetail.projectDatasets.find(d => d.datasetType === "hfa");

  if (hmisDataset || hfaDataset) {
    sections.push("");
    sections.push("**Loaded datasets:**");
    if (hmisDataset && hmisDataset.datasetType === "hmis") {
      sections.push(`- HMIS data (version ${hmisDataset.info.version})`);
    }
    if (hfaDataset) {
      sections.push(`- HFA data`);
    }
  }

  // Indicators
  if (instanceDetail.indicators.commonIndicators > 0) {
    sections.push("");
    sections.push(`**Common indicators available:** ${instanceDetail.indicators.commonIndicators}`);
  }

  // Modules
  if (projectDetail.projectModules.length > 0) {
    sections.push("");
    sections.push(`**Installed analysis modules:** ${projectDetail.projectModules.length}`);
  }

  // Structure
  if (instanceDetail.structure) {
    sections.push("");
    sections.push("**Data coverage:**");
    sections.push(`- ${instanceDetail.structure.facilities} facilities`);
    if (instanceDetail.structure.adminArea2s > 0) {
      sections.push(`- ${instanceDetail.structure.adminArea2s} admin area 2s`);
    }
    if (instanceDetail.structure.adminArea3s > 0) {
      sections.push(`- ${instanceDetail.structure.adminArea3s} admin area 3s`);
    }
  }

  // User-provided custom context
  if (projectDetail.aiContext.trim()) {
    sections.push("");
    sections.push("# Additional Project Context");
    sections.push("");
    sections.push(projectDetail.aiContext.trim());
  }

  sections.push("");
  sections.push("---");
  sections.push("");

  return sections.join("\n");
}
