import { _IS_PRODUCTION } from "../../exposed_env_vars.ts";

// The image every module container runs in production (dev runs the host
// Rscript directly). Recorded per run in the manifest (PLAN_RESULTS_RUNS
// §6.4) so a run states which R environment produced its outputs.
export const R_DOCKER_IMAGE_TAG = _IS_PRODUCTION
  ? "timroberton/comb:wb-hmis-r-linux"
  : "timroberton/comb:wb-hmis-r-local";
