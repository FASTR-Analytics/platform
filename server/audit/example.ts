// Example integration of the audit logging system
// This file shows how to integrate audit logging into your existing routes
// Note: The audit table schema is in src/db/instance/_main_database.sql

import { Hono } from "hono";
import { auditLog, trackActivity } from "./middleware.ts";
import { trackUserLogin, trackUserLogout, logAuditEvent } from "./mod.ts";
import { defineRoute } from "../routes/route-helpers.ts";
import { getProjectEditor, getProjectViewer } from "../project_auth.ts";

// ============================================================================
// ROUTE-BASED AUDITING EXAMPLES
// ============================================================================

const exampleRoutes = new Hono();

// Example 1: Simple audit with automatic extraction
// The middleware will automatically:
// - Extract user_email from c.var.globalUser or c.var.projectUser
// - Extract project_id from c.var.ppk.projectId
// - Infer resource_type from action name ("module" from "INSTALL_MODULE")
// - Extract resource_id from params (module_id, id, etc.)
defineRoute(
  exampleRoutes,
  "installModule",
  getProjectEditor,
  auditLog("INSTALL_MODULE"), // One-liner audit
  async (c, { params }) => {
    // Your existing route logic
    return c.json({ success: true });
  }
);

// Example 2: Audit with custom details
defineRoute(
  exampleRoutes,
  "updateModuleParameters",
  getProjectEditor,
  auditLog("UPDATE_MODULE_PARAMS", {
    details: (c) => ({
      module_id: c.req.param("module_id"),
      param_count: c.req.json()?.newParams?.length || 0,
    }),
  }),
  async (c, { params, body }) => {
    // Your route logic
    return c.json({ success: true });
  }
);

// Example 3: Audit with custom resource extraction
defineRoute(
  exampleRoutes,
  "deleteReport",
  getProjectEditor,
  auditLog({
    action: "DELETE_REPORT",
    extractResourceId: (c) => c.req.param("report_id"),
    extractResourceType: () => "report",
  }),
  async (c, { params }) => {
    // Your route logic
    return c.json({ success: true });
  }
);

// Example 4: Multiple middleware (auth, audit, custom)
// defineRoute(
//   exampleRoutes,
//   "uploadDataset",
//   getProjectEditor,
//   auditLog("UPLOAD_DATASET"),
//   async (c, { params, body }) => {
//     // Your route logic
//     return c.json({ success: true });
//   }
// );

// ============================================================================
// AUTHENTICATION TRACKING EXAMPLES
// ============================================================================

// Example: Track user login (call this after successful authentication)
async function handleUserLogin(email: string, request: Request) {
  await trackUserLogin(email, {
    ip_address: request.headers.get("x-forwarded-for") || "unknown",
    user_agent: request.headers.get("user-agent") || "unknown",
    session_id: crypto.randomUUID(),
    auth_method: "clerk",
  });
}

// Example: Track user logout
async function handleUserLogout(email: string, sessionId?: string) {
  await trackUserLogout(email, sessionId);
}

// ============================================================================
// GLOBAL ACTIVITY TRACKING
// ============================================================================

// Example: Add activity tracking to your main app
// This will log user activity every 5 minutes (throttled)
const app = new Hono();

app.use(
  "*",
  trackActivity({
    throttleMinutes: 5,
    excludePaths: ["/health", "/metrics", "/static"],
    onlyLoggedInUsers: true,
  })
);

// ============================================================================
// DIRECT LOGGING EXAMPLES
// ============================================================================

// Example: Log custom events directly
async function handleCustomEvent(userEmail: string, projectId: string) {
  await logAuditEvent({
    user_email: userEmail,
    action: "CUSTOM_DATA_EXPORT",
    project_id: projectId,
    resource_type: "data",
    resource_id: "export_123",
    details: {
      format: "csv",
      rows: 1000,
      timestamp: new Date().toISOString(),
    },
    success: true,
    error_message: null,
  });
}

// Example: Log errors with context
async function handleErrorWithAudit(
  userEmail: string,
  action: string,
  error: Error
) {
  await logAuditEvent({
    user_email: userEmail,
    action: action,
    project_id: null,
    resource_type: null,
    resource_id: null,
    details: {
      error_type: error.name,
      error_stack: error.stack,
    },
    success: false,
    error_message: error.message,
  });
}

// ============================================================================
// INTEGRATION PATTERNS
// ============================================================================

// Pattern 1: Wrap existing route handlers
function withAudit(action: string, handler: any) {
  return [auditLog(action), handler];
}

// Pattern 2: Conditional auditing
function conditionalAudit(action: string, condition: (c: any) => boolean) {
  return async (c: any, next: any) => {
    if (condition(c)) {
      return auditLog(action)(c, next);
    }
    await next();
  };
}

// Pattern 3: Audit with pre/post processing
function auditWithProcessing(action: string) {
  return async (c: any, next: any) => {
    // Pre-processing
    const startData = await c.req.json();

    // Run the audit middleware
    await auditLog(action, {
      details: () => ({
        input_size: JSON.stringify(startData).length,
      }),
    })(c, next);

    // Post-processing could go here
  };
}

export {
  exampleRoutes,
  handleUserLogin,
  handleUserLogout,
  handleCustomEvent,
  handleErrorWithAudit,
};
