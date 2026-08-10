import {
  closeAllConnections,
  createPersonalAccessToken,
  getPgConnectionFromCacheOrNew,
} from "./server/db/mod.ts";

// Mint a personal access token for a user, for headless clients (the MCP
// host, CLI). Run with the app .env present (it carries the DB credentials):
//
//   deno task mint-pat you@example.com my-label
//
// The email must already exist as a FASTR user (the token carries exactly
// that user's permissions). Only the SHA-256 hash is stored — the token is
// printed once and cannot be read back; revoke via the app API
// (DELETE /user/personal-access-tokens) or by deleting the row.

const [email, label] = Deno.args;
if (!email || !label) {
  console.error("Usage: deno task mint-pat <email> <label>");
  Deno.exit(1);
}

const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
const res = await createPersonalAccessToken(mainDb, email, label);
if (!res.success) {
  console.error(`Failed to mint token: ${res.err}`);
  console.error(
    "(The email must be an existing FASTR user — the tokens table FKs users.email.)",
  );
  await closeAllConnections();
  Deno.exit(1);
}

console.log(`Personal access token for ${email} (label "${label}"):\n`);
console.log(res.data.token);
console.log("\nCopy it now — it is shown only once (only its hash is stored).");
await closeAllConnections();
