import { Hono, type Context } from "hono";
import { routeRegistry } from "lib";
import { markRouteDefinedEnhanced } from "./route-tracker.ts";

// Extract params type directly from route registry
type RouteParams<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K] extends { params: infer P } ? P : {};

// Extract body type directly from route registry
type RouteBody<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K] extends { body: infer B } ? B : {};

// Extract response type directly from route registry
type RouteResponse<K extends keyof typeof routeRegistry> =
  (typeof routeRegistry)[K] extends { response: infer R } ? R : never;

// Handler function type with proper typing
type RouteHandler<K extends keyof typeof routeRegistry> = (
  c: Context,
  args: {
    params: RouteParams<K>;
    body: RouteBody<K>;
  }
) => Promise<Response>;

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
    const params: any = {};
    const paramNames = route.path.match(/:(\w+)/g);
    if (paramNames) {
      for (const paramName of paramNames) {
        const key = paramName.slice(1); // Remove the :
        params[key] = c.req.param(key);
      }
    }

    // Extract body if it's a method that typically has a body
    let body: any = {};
    const method = route.method as string;
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      try {
        body = c.var.cachedBody ?? await c.req.json();
      } catch {
        // No body or invalid JSON
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
  markRouteDefinedEnhanced(routeName);
}
