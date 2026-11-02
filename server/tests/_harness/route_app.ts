// The route-test harness: a Hono app that signs every request in as one
// session by simulating only clerkMiddleware's output contract, so the real
// guards, getGlobalUser and the users row decide everything after it.

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import type { Env } from "hono";
import type { Sql } from "postgres";
import { getPgConnection } from "../../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH, _PERSONA_AUTH } from "../../exposed_env_vars.ts";

export type Envelope =
  | { success: true; data?: unknown }
  | { success: false; err: string };

// The claims a Clerk session carries: an email alone means no name claims,
// as a headless credential has none; null is a signed-out request.
export type SessionClaims = {
  email: string;
  firstName: string | null;
  lastName: string | null;
};
export type Session = string | SessionClaims | null;

// clerkMiddleware's output contract under @hono/clerk-auth v3: c.var.clerkAuth
// is the auth FUNCTION getAuth() invokes, its object tagged with the session
// token type that getClerkSessionAuth checks; a signed-out request resolves
// to null (the middleware populates, it never rejects).
export function clerkLeg(session: Session) {
  const claims = typeof session === "string"
    ? { email: session, firstName: null, lastName: null }
    : session;
  const auth = claims === null ? null : {
    userId: `user_${claims.email}`,
    tokenType: "session_token",
    sessionClaims: claims,
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
  session: Session,
  ...routers: { [K in keyof E]: Hono<E[K]> }
): Hono {
  const app = new Hono();
  app.use("*", clerkLeg(session) as never);
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

// The status alone, whatever the body is (a stream, a file, plain text): the
// request is aborted once the status is known, so a long-lived response such
// as the SSE stream ends with the call. A string body is sent as given, so a
// handler can be sent what is not JSON.
export async function statusOf(
  app: Hono,
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<number> {
  const aborter = new AbortController();
  const body = init.body === undefined
    ? undefined
    : typeof init.body === "string"
    ? init.body
    : JSON.stringify(init.body);
  const res = await app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
    body,
    signal: aborter.signal,
  });
  aborter.abort();
  await res.body?.cancel().catch(() => {});
  return res.status;
}

export function assertRealAuth(): void {
  if (_BYPASS_AUTH || _PERSONA_AUTH) {
    throw new Error(
      "BYPASS_AUTH or PERSONA_AUTH is set: route tests must exercise the real auth branches. Unset it and re-run.",
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
