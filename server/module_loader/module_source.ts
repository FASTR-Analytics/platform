import { _IS_PRODUCTION } from "../exposed_env_vars.ts";

// Where module-definition files (and pinned repo assets) come from: the
// GitHub modules repo in production, at the branch FASTR_MODULES_BRANCH names
// (main by default), and the local wb-fastr-modules checkout
// (FASTR_MODULES_LOCAL_DIR) in dev.
export const MODULE_SOURCE: "local" | "github" = _IS_PRODUCTION
  ? "github"
  : "local";
