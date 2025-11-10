// Audit Logging System
// A lightweight, efficient system for tracking user actions and data mutations

// Core middleware
export { auditLog, trackActivity } from "./middleware.ts";

// Authentication tracking
export {
  trackUserLogin,
  trackUserLogout,
  trackFailedLogin,
  trackUserActivity,
  trackSessionActivity,
  cleanupSessionActivity,
} from "./auth-tracking.ts";

// Direct logging
export { logAuditEvent, flushAuditLogs } from "./storage.ts";

// Types
export type {
  AuditLog,
  AuditAction,
  AuditConfig,
  DirectAuditLog,
  ActivityConfig,
  LoginDetails,
} from "./types.ts";