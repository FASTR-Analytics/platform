// The route-test harness: a Hono app that signs every request in as one
// email by simulating only clerkMiddleware's output contract, so the real
// guards, getGlobalUser and the users row decide everything after it.

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import type { Env } from "hono";
import { _BYPASS_AUTH } from "../../exposed_env_vars.ts";

export type Envelope =
  | { success: true; data?: unknown }
  | { success: false; err: string };

export function clerkLeg(email: string) {
  const auth = {
    userId: `user_${email}`,
    tokenType: "session_token",
    sessionClaims: { email, firstName: null, lastName: null },
  };
  return async (
    c: { set: (k: never, v: never) => void },
    next: () => Promise<void>,
  ) => {
    c.set("clerkAuth" as never, (() => auth) as never);
    await next();
  };
}

export function appFor<E extends Env[]>(
  email: string,
  ...routers: { [K in keyof E]: Hono<E[K]> }
): Hono {
  const app = new Hono();
  app.use("*", clerkLeg(email) as never);
  for (const router of routers) {
    app.route("/", router);
  }
  return app;
}

export async function call(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope }> {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function ok<T>(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await call(app, method, path, body);
  assertEquals(res.status, 200, `${method} ${path}: ${JSON.stringify(res)}`);
  assert(res.body.success, `${method} ${path}: ${JSON.stringify(res.body)}`);
  return res.body.data as T;
}

export async function status(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<number> {
  return (await call(app, method, path, body)).status;
}

export function assertRealAuth(): void {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set: route tests must exercise the real auth branches. Unset it and re-run.",
    );
  }
}
