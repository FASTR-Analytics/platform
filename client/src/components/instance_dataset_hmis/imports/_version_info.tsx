import { t3, type DatasetHmisVersion } from "lib";
import { openAlert } from "panther";
import { serverActions } from "~/server_actions";

// The History→version navigation that replaced the "View previous imports"
// entry point (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase D): a run detail's
// Version row opens the version's import information directly. The versions
// table and the ImportInformation view itself are unchanged — runs are
// operations, versions are outcomes, never merged. A miss is reachable (a
// running run's version is hidden from the versions list; a version can be
// deleted after its run) and alerts instead of no-opping.
export async function fetchDatasetHmisVersion(
  versionId: number,
): Promise<DatasetHmisVersion | undefined> {
  const res = await serverActions.getDatasetHmisVersions({});
  const version = res.success
    ? res.data.find((v) => v.id === versionId)
    : undefined;
  if (!version) {
    await openAlert({
      title: t3({
        en: "Version details unavailable",
        fr: "Détails de la version indisponibles",
        pt: "Detalhes da versão indisponíveis",
      }),
      text: t3({
        en: "This version's import information cannot be shown right now — the import may still be running, or the version may have been deleted.",
        fr: "Les informations d'importation de cette version ne peuvent pas être affichées pour le moment — l'importation est peut-être encore en cours, ou la version a peut-être été supprimée.",
        pt: "As informações de importação desta versão não podem ser mostradas neste momento — a importação pode ainda estar em curso, ou a versão pode ter sido eliminada.",
      }),
      intent: "danger",
    });
  }
  return version;
}
