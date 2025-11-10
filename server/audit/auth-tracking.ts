import type { LoginDetails } from "./types.ts";
import { logAuditEvent } from "./storage.ts";

export async function trackUserLogin(
  email: string,
  details?: LoginDetails
): Promise<void> {
  await logAuditEvent({
    user_email: email,
    action: "USER_LOGIN",
    project_id: null,
    resource_type: "auth",
    resource_id: email,
    method: null,
    path: null,
    details: {
      ip_address: details?.ip_address,
      user_agent: details?.user_agent,
      auth_method: details?.auth_method || "clerk",
      session_id: details?.session_id,
      timestamp: new Date().toISOString(),
    },
    success: true,
    error_message: null,
    session_id: details?.session_id ?? null,
  });
}

export async function trackUserLogout(
  email: string,
  sessionId?: string
): Promise<void> {
  await logAuditEvent({
    user_email: email,
    action: "USER_LOGOUT",
    project_id: null,
    resource_type: "auth",
    resource_id: email,
    method: null,
    path: null,
    details: {
      timestamp: new Date().toISOString(),
    },
    success: true,
    error_message: null,
    session_id: sessionId ?? null,
  });
}

export async function trackFailedLogin(
  emailOrAttempt: string,
  reason: string,
  details?: Partial<LoginDetails>
): Promise<void> {
  await logAuditEvent({
    user_email: emailOrAttempt,
    action: "USER_LOGIN",
    project_id: null,
    resource_type: "auth",
    resource_id: emailOrAttempt,
    method: null,
    path: null,
    details: {
      ip_address: details?.ip_address,
      user_agent: details?.user_agent,
      auth_method: details?.auth_method || "clerk",
      failure_reason: reason,
      timestamp: new Date().toISOString(),
    },
    success: false,
    error_message: reason,
    session_id: null,
  });
}

export async function trackUserActivity(
  email: string,
  projectId?: string | null,
  path?: string
): Promise<void> {
  await logAuditEvent({
    user_email: email,
    action: "USER_ACTIVITY",
    project_id: projectId ?? null,
    resource_type: null,
    resource_id: null,
    method: null,
    path: path ?? null,
    details: {
      timestamp: new Date().toISOString(),
    },
    success: true,
    error_message: null,
  });
}

const sessionActivityMap = new Map<string, number>();

export async function trackSessionActivity(
  email: string,
  sessionId: string,
  projectId?: string | null,
  throttleMs: number = 60000
): Promise<void> {
  const key = `${email}:${sessionId}`;
  const now = Date.now();
  const lastActivity = sessionActivityMap.get(key) ?? 0;

  if (now - lastActivity < throttleMs) {
    return;
  }

  sessionActivityMap.set(key, now);

  await logAuditEvent({
    user_email: email,
    action: "USER_ACTIVITY",
    project_id: projectId ?? null,
    resource_type: null,
    resource_id: null,
    method: null,
    path: null,
    details: {
      session_based: true,
      timestamp: new Date().toISOString(),
    },
    success: true,
    error_message: null,
    session_id: sessionId,
  });
}

export function cleanupSessionActivity(olderThanMs: number = 3600000): void {
  const now = Date.now();
  const cutoff = now - olderThanMs;

  for (const [key, lastActivity] of sessionActivityMap.entries()) {
    if (lastActivity < cutoff) {
      sessionActivityMap.delete(key);
    }
  }
}

if (typeof globalThis.setInterval !== "undefined") {
  setInterval(() => {
    cleanupSessionActivity();
  }, 3600000);
}