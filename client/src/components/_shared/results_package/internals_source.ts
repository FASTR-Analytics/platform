import type {
  APIResponseWithData,
  ModuleId,
  RunModuleFileListing,
} from "lib";
import { serverActions, _SERVER_HOST } from "~/server_actions";

// How the shared package viewers reach a package's internals. The BYTES are
// the same wherever a package is explored (PLAN_RESULTS_RUNS item 3b), but the
// route and the permission are not, so each surface supplies a source and the
// viewers stay host-agnostic — the same reasoning that made the AI module
// tools take a run resolver instead of a runId.
//
// The three `can*` flags decide whether a surface OFFERS a button. The server
// guards are authoritative; these exist so a caller without access sees no
// button rather than one that fails when pressed.
export type PackageInternalsSource = {
  canViewScript: boolean;
  canViewLogs: boolean;
  canViewFiles: boolean;
  getScript: (
    moduleId: ModuleId,
  ) => Promise<APIResponseWithData<{ script: string }>>;
  getLogs: (
    moduleId: ModuleId,
  ) => Promise<APIResponseWithData<{ logs: string }>>;
  listFiles: (
    moduleId: ModuleId,
  ) => Promise<APIResponseWithData<RunModuleFileListing>>;
  fileHref: (moduleId: ModuleId, fileName: string) => string;
};

// The instance catalogue: run-keyed, one instance-admin permission for
// everything, because an admin browses packages that may be attached to no
// project at all.
export function instancePackageInternalsSource(
  runId: string,
  isInstanceAdmin: boolean,
): PackageInternalsSource {
  return {
    canViewScript: isInstanceAdmin,
    canViewLogs: isInstanceAdmin,
    canViewFiles: isInstanceAdmin,
    getScript: (moduleId) =>
      serverActions.getRunModuleScript({ run_id: runId, module_id: moduleId }),
    getLogs: (moduleId) =>
      serverActions.getRunModuleLogs({ run_id: runId, module_id: moduleId }),
    listFiles: (moduleId) =>
      serverActions.listRunModuleFiles({ run_id: runId, module_id: moduleId }),
    fileHref: (moduleId, fileName) =>
      `${_SERVER_HOST}/${runId}/outputs/${moduleId}/${fileName}?t=${Date.now()}`,
  };
}

// A project: no runId anywhere — the server resolves the package from
// `projects.run_id`, so a member can only ever read what their project serves
// from. One permission per kind of content, using the per-project bits the app
// already had for exactly this (Tim's ruling 2026-07-30).
//
// The download is a path-scoped streaming endpoint rather than a server action
// because an `<a download>` cannot send the `Project-Id` header (see the route
// comment).
export function projectPackageInternalsSource(
  projectId: string,
  permissions: {
    can_view_script_code: boolean;
    can_view_logs: boolean;
    can_view_data: boolean;
  },
): PackageInternalsSource {
  return {
    canViewScript: permissions.can_view_script_code,
    canViewLogs: permissions.can_view_logs,
    canViewFiles: permissions.can_view_data,
    getScript: (moduleId) =>
      serverActions.getAttachedPackageModuleScript({
        projectId,
        module_id: moduleId,
      }),
    getLogs: (moduleId) =>
      serverActions.getAttachedPackageModuleLogs({
        projectId,
        module_id: moduleId,
      }),
    listFiles: (moduleId) =>
      serverActions.listAttachedPackageModuleFiles({
        projectId,
        module_id: moduleId,
      }),
    fileHref: (moduleId, fileName) =>
      `${_SERVER_HOST}/results_package_file/${projectId}/${moduleId}/${
        encodeURIComponent(fileName)
      }?t=${Date.now()}`,
  };
}
