import {
  hashFacilityColumnsConfig,
  type InstanceState,
  type ModuleLatestCommit,
  type ProjectState,
} from "lib";

export function checkDataNeedsUpdate(
  projectState: ProjectState,
  instanceState: InstanceState,
): boolean {
  const hmis = projectState.projectDatasets.find((d) => d.datasetType === "hmis");
  if (hmis && hmis.datasetType === "hmis") {
    const info = hmis.info;
    const instVersion = instanceState.datasetVersions.hmis;
    if (instVersion !== undefined && info.version.id < instVersion) return true;
    if (
      instanceState.structureLastUpdated &&
      info.structureLastUpdated &&
      instanceState.structureLastUpdated > info.structureLastUpdated
    ) return true;
    if (instanceState.indicatorMappingsVersion !== info.indicatorMappingsVersion) return true;
    if (
      info.facilityColumnsConfig &&
      JSON.stringify(instanceState.facilityColumns) !== JSON.stringify(info.facilityColumnsConfig)
    ) return true;
    if (
      info.maxAdminArea !== undefined &&
      instanceState.maxAdminArea !== info.maxAdminArea
    ) return true;
    if (
      instanceState.calculatedIndicatorsVersion !== info.calculatedIndicatorsVersion
    ) return true;
  }

  const hfa = projectState.projectDatasets.find((d) => d.datasetType === "hfa");
  if (hfa && hfa.datasetType === "hfa") {
    const info = hfa.info;
    // Mirrors the Data page (project_data.tsx): a pre-staleness-tracking
    // export can't be change-detected, so it always counts as needing
    // re-export.
    if (info._legacy) return true;
    if (instanceState.hfaCacheHash !== info.hfaCacheHash) return true;
    if (instanceState.hfaIndicatorsVersion !== info.hfaIndicatorsVersion) return true;
    if (instanceState.structureLastUpdated !== info.structureLastUpdated) return true;
    if (hashFacilityColumnsConfig(instanceState.facilityColumns) !== info.facilityColumnsHash) return true;
  }

  const iceh = projectState.projectDatasets.find((d) => d.datasetType === "iceh");
  if (iceh && iceh.datasetType === "iceh") {
    if (iceh.info.icehCacheHash !== instanceState.icehCacheHash) return true;
  }

  return false;
}

export function checkModulesNeedUpdate(
  projectModules: ProjectState["projectModules"],
  moduleLatestCommits: ModuleLatestCommit[] | undefined,
): boolean {
  if (!moduleLatestCommits) return false;
  return projectModules.some((mod) => {
    const entry = moduleLatestCommits.find((c) => c.moduleId === mod.id);
    if (!entry) return false;
    return !mod.presentationDefGitRef || entry.latestCommit.sha !== mod.presentationDefGitRef;
  });
}
