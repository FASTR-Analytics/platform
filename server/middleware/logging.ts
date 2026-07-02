import { createMiddleware } from "hono/factory";
import { AddLog } from "../db/instance/user_logs.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";

// Credential fields must never reach user_logs (rows are retained indefinitely
// and readable via the logs UI with only can_view_logs).
const _REDACTED_BODY_KEYS = ["password", "secret", "token", "apikey"];

function redactSensitiveFields(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveFields);
    }
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, v]) => [
                key,
                _REDACTED_BODY_KEYS.includes(key.toLowerCase())
                    ? "[REDACTED]"
                    : redactSensitiveFields(v),
            ])
        );
    }
    return value;
}

export const log = (routeName: string) =>
    createMiddleware(async (c, next) => {
        let body: unknown = {};
        const method = c.req.method;
        if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"){
            const contentType = c.req.header("Content-Type") ?? "";
            if (contentType.includes("application/json") || contentType === "") {
                try{
                    body = redactSensitiveFields(await c.req.json());
                } catch {
                    // No body or invalid json
                }
            }
        }
        let error: unknown;
        try {
            await next();
        } catch (e) {
            error = e;
        }

        try {
            const userEmail = c.var.globalUser?.email ?? c.var.projectUser?.email ?? "unknown";

            const mainDb = c.var.mainDb ?? getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

            const params: Record<string, string> = {};
            for (const [key, value] of Object.entries(c.req.param())) {
                params[key] = value as string;
            }

            const status = error ? "500" : c.res.status.toString();

            // Exclude sensitive headers from logs
            const headers = Object.fromEntries(
                [...c.req.raw.headers.entries()].filter(
                    ([key]) => !["authorization", "cookie"].includes(key.toLowerCase())
                )
            );
            const _MAX_DETAILS_BYTES = 65536;
            let details = JSON.stringify({ params, body, headers, error: error ? String(error) : undefined });
            if (details.length > _MAX_DETAILS_BYTES) {
                const truncatedBody = { _truncated: true, bytes: JSON.stringify(body).length };
                details = JSON.stringify({ params, body: truncatedBody, headers, error: error ? String(error) : undefined });
            }
            if (details.length > _MAX_DETAILS_BYTES) {
                details = JSON.stringify({ _truncated: true, bytes: details.length });
            }

            const projectId = c.var.ppk?.projectId as string | undefined;
            if (c.var.globalUser?.approved !== false) {
                AddLog(mainDb, userEmail, routeName, status, details, projectId).catch(() => {});
            }
        } catch {
            // Don't let logging errors break the response
        }

        if (error) throw error;
    });