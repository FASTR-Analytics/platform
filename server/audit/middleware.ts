import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuditAction, AuditConfig, ActivityConfig } from "./types.ts";
import { logAuditEvent } from "./storage.ts";

const lastActivityMap = new Map<string, number>();

function extractResourceTypeFromAction(action: string): string | undefined {
  const actionLower = action.toLowerCase();
  
  if (actionLower.includes("module")) return "module";
  if (actionLower.includes("dataset")) return "dataset";
  if (actionLower.includes("report")) return "report";
  if (actionLower.includes("presentation")) return "presentation";
  if (actionLower.includes("project")) return "project";
  if (actionLower.includes("user")) return "user";
  if (actionLower.includes("structure")) return "structure";
  if (actionLower.includes("hmis")) return "hmis_data";
  
  return undefined;
}

function extractResourceIdFromParams(c: Context): string | undefined {
  const params = c.req.param();
  
  if (params.id) return params.id;
  if (params.module_id) return params.module_id;
  if (params.report_id) return params.report_id;
  if (params.dataset_id) return params.dataset_id;
  if (params.presentation_id) return params.presentation_id;
  if (params.project_id) return params.project_id;
  if (params.user_id) return params.user_id;
  
  const keys = Object.keys(params);
  const idKey = keys.find(k => k.endsWith("_id") || k === "id");
  if (idKey) return params[idKey];
  
  return undefined;
}

function extractUserEmail(c: Context): string | undefined {
  if (c.var?.globalUser?.email) return c.var.globalUser.email;
  if (c.var?.projectUser?.email) return c.var.projectUser.email;
  
  if (c.var?.globalUser && typeof c.var.globalUser === "object") {
    const user = c.var.globalUser as any;
    if (user.email) return user.email;
  }
  
  return undefined;
}

function extractProjectId(c: Context): string | undefined {
  if (c.var?.ppk?.projectId) return c.var.ppk.projectId;
  
  const projectIdParam = c.req.param("project_id");
  if (projectIdParam) return projectIdParam;
  
  return undefined;
}

export function auditLog(
  actionOrConfig: AuditAction | AuditConfig,
  configOverride?: Partial<AuditConfig>
): any {
  const config: AuditConfig = typeof actionOrConfig === "string" 
    ? { action: actionOrConfig, ...configOverride }
    : { ...actionOrConfig, ...configOverride };

  return createMiddleware(async (c: Context, next: Next) => {
    const startTime = Date.now();
    const userEmail = extractUserEmail(c);
    
    if (!userEmail && config.skipOnError !== false) {
      await next();
      return;
    }

    let success = true;
    let errorMessage: string | undefined;

    try {
      await next();
      
      const status = c.res.status;
      if (status >= 400) {
        success = false;
        errorMessage = `HTTP ${status}`;
      }
    } catch (error) {
      success = false;
      errorMessage = error instanceof Error ? error.message : "Unknown error";
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      
      const resourceType = config.extractResourceType?.(c) 
        ?? extractResourceTypeFromAction(config.action);
      
      const resourceId = config.extractResourceId?.(c) 
        ?? extractResourceIdFromParams(c);
      
      const details = config.details?.(c) ?? {};
      
      if (duration > 0) {
        details.duration_ms = duration;
      }

      try {
        await logAuditEvent({
          user_email: userEmail || "unknown",
          action: config.action,
          project_id: extractProjectId(c) ?? null,
          resource_type: resourceType ?? null,
          resource_id: resourceId ?? null,
          method: c.req.method,
          path: c.req.path,
          details: Object.keys(details).length > 0 ? details : null,
          success,
          error_message: errorMessage ?? null,
        });
      } catch (auditError) {
        console.error("Failed to log audit event:", auditError);
      }
    }
  });
}

export function trackActivity(config: ActivityConfig = {}): any {
  const {
    throttleMinutes = 5,
    excludePaths = ["/health", "/metrics", "/favicon.ico"],
    onlyLoggedInUsers = true,
  } = config;

  const throttleMs = throttleMinutes * 60 * 1000;

  return createMiddleware(async (c: Context, next: Next) => {
    await next();

    const path = c.req.path;
    if (excludePaths.some(p => path.startsWith(p))) {
      return;
    }

    const userEmail = extractUserEmail(c);
    if (!userEmail && onlyLoggedInUsers) {
      return;
    }

    if (!userEmail) {
      return;
    }

    const now = Date.now();
    const lastActivity = lastActivityMap.get(userEmail) ?? 0;

    if (now - lastActivity < throttleMs) {
      return;
    }

    lastActivityMap.set(userEmail, now);

    try {
      await logAuditEvent({
        user_email: userEmail,
        action: "USER_ACTIVITY",
        project_id: extractProjectId(c) ?? null,
        method: c.req.method,
        path: c.req.path,
        success: true,
        details: {
          status_code: c.res.status,
        },
      });
    } catch (error) {
      console.error("Failed to track activity:", error);
    }
  });
}