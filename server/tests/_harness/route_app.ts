// The route-test harness: a Hono app that signs every request in as one
// email by simulating only clerkMiddleware's output contract, so the real
// guards, getGlobalUser and the users row decide everything after it.

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import type { Env } from "hono";
import type { Sql } from "postgres";
import { getPgConnection } from "../../db/postgres/connection_manager.ts";
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

const SCHEMA_PATH =
  new URL("../../db/instance/_main_database.sql", import.meta.url).pathname;

// Runs `run` on a throwaway database built from _main_database.sql on the
// dev postgres, dropped afterwards, along with any a crashed run left under
// the same prefix.
export async function withSchemaDb(
  prefix: string,
  run: (db: Sql) => Promise<void>,
): Promise<void> {
  const admin = getPgConnection("postgres", { max: 1 });
  for (
    const { datname } of await admin<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname LIKE ${prefix + "%"}
    `
  ) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${datname} WITH (FORCE)`);
  }
  const dbName = `${prefix}${Date.now()}`;
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  const db = getPgConnection(dbName, { max: 2 });
  try {
    await db.file(SCHEMA_PATH);
    await run(db);
  } finally {
    await db.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
}
