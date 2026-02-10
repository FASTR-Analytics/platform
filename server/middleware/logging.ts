import { createMiddleware } from "hono/factory";
import { AddLog } from "../db/instance/user_logs.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";

export const log = (routeName: string) =>  
    createMiddleware(async (c, next) => {
        let body: unknown = {};
        const method = c.req.method;
        if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"){
            const contentType = c.req.header("Content-Type") ?? "";
            if (contentType.includes("application/json")) {
                try{
                    body = await c.req.json();
                    c.set("cachedBody", body);
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
            const details = JSON.stringify({ params, body, headers, error: error ? String(error) : undefined });

            const projectId = c.var.ppk?.projectId as string | undefined;
            AddLog(mainDb, userEmail, routeName, status, details, projectId).catch(() => {});
        } catch {
            // Don't let logging errors break the response
        }

        if (error) throw error;
    });