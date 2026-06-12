import { Hono, type Context } from "hono";
import type { TypedResponse } from "hono";
import type { JSONParsed } from "hono/utils/types";
import { z } from "zod";
import { routeRegistry } from "lib";
import { markRouteDefined } from "./route-tracker.ts";

// Extract params type directly from route registry
type RouteParams<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K] extends { params: infer P } ? P : {};

// Extract body type directly from route registry
type RouteBody<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K] extends { body: infer B } ? B : {};

// The full APIResponse envelope type for this route key (already resolved by route-utils.ts).
export type RouteEnvelope<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K]["response"];

// Handler function type with proper typing.
// Non-streaming handlers must return what c.json(res) produces when res matches the
// declared registry response type. The constraint compares in wire-space (JSONParsed maps
// Date → string, matching JSON serialization), so envelopes whose types carry server-side
// Date fields pass without casts while shape drift and missing envelopes are still
// rejected. Streaming handlers return a plain Response from streamResponse().
type RouteHandler<K extends keyof typeof routeRegistry> = (
  c: Context,
  args: {
    params: RouteParams<K>;
    body: RouteBody<K>;
  }
) => (typeof routeRegistry)[K] extends { isStreaming: true }
  ? Promise<Response>
  : Promise<Response & TypedResponse<JSONParsed<RouteEnvelope<K>>>>;

// Format a ZodError into a single readable string for the APIResponse err field.
function zodErr(error: z.ZodError): string {
  return error.issues
    .map(i => (i.path.length > 0 ? i.path.join(".") + ": " : "") + i.message)
    .join("; ");
}

// Define a route using the registry
export function defineRoute<K extends keyof typeof routeRegistry>(
  router: Hono,
  routeName: K,
  ...args: [...middlewares: any[], handler: RouteHandler<K>]
) {
  const route = routeRegistry[routeName];
  const middlewares = args.slice(0, -1);
  const handler = args[args.length - 1] as RouteHandler<K>;

  // Wrap the handler to extract params and body
  const wrappedHandler = async (c: Context) => {
    // Extract params from the URL
    let params: any = {};
    const paramNames = route.path.match(/:(\w+)/g);
    if (paramNames) {
      for (const paramName of paramNames) {
        const key = paramName.slice(1);
        params[key] = c.req.param(key);
      }
    }
    // Validate + coerce params if a Zod schema is present
    const paramsSchema = (route as any).params;
    if (paramsSchema instanceof z.ZodType) {
      const result = paramsSchema.safeParse(params);
      if (!result.success) {
        return c.json({ success: false, err: zodErr(result.error) }, 400);
      }
      params = result.data;
    }

    // Extract body if it's a method that typically has a body
    let body: any = {};
    const method = route.method as string;
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      // Parse with {} fallback so a missing/invalid-JSON body still goes through the
      // schema below (and 400s on required fields) instead of bypassing validation.
      let rawBody: unknown = {};
      try {
        rawBody = await c.req.json();
      } catch {
        // No body or invalid JSON — validate {} like any other input
      }
      const bodySchema = (route as any).body;
      if (bodySchema instanceof z.ZodType) {
        const result = bodySchema.safeParse(rawBody);
        if (!result.success) {
          return c.json({ success: false, err: zodErr(result.error) }, 400);
        }
        body = result.data;
      } else {
        body = rawBody;
      }
    }

    // Call the handler with typed args
    const response = await handler(c, { params, body });

    return response;
  };

  // Register the route with Hono
  const method = route.method.toLowerCase() as
    | "get"
    | "post"
    | "put"
    | "delete"
    | "patch";
  (router[method] as any)(route.path, ...middlewares, wrappedHandler);

  // Mark this route as defined
  markRouteDefined(routeName);
}
