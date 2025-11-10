import { clerkMiddleware } from "@hono/clerk-auth";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";

export const authMiddleware = _BYPASS_AUTH
  ? async (c: any, next: any) => await next()
  : clerkMiddleware();