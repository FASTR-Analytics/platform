import { createMiddleware } from "hono/factory";
import { AddLog } from "../db/instance/user_logs.ts";
import { AddProjectLog } from "../db/project/project_user_logs.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";

export const log = (routeName: string) =>  
    createMiddleware(async (c, next) => {
        let body: unknown = {};
        const method = c.req.method;
        if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"){
            try{
                body = await c.req.json();
                c.set("cachedBody", body);
            } catch {
                // No body or invalid json
            }
        }

        await next();

        // Log after route completes
        const userEmail = c.var.globalUser?.email ?? c.var.projectUser?.email;
        if(!userEmail) return;

        const mainDb = c.var.mainDb ?? getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
        
        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(c.req.param())) {
            params[key] = value;
        }

        const details = JSON.stringify({ params, body });
        const status = c.res.status.toString();

        const projectId = c.var.ppk?.projectId as string | undefined;
        if (projectId) {
            const projectDb = c.var.ppk.projectDb;
            AddProjectLog(projectDb, userEmail, routeName, status, projectId, details).catch(() => {});
        }
        AddLog(mainDb, userEmail, routeName, status, details).catch(() => {});
    });