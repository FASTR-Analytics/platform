# Plan: Display User Names in Instance Users Table

## Context

The user table in `instance_users.tsx` only shows email, last active, and status. Names are available from Clerk session claims on login but never stored. The fix: add `first_name`/`last_name` to the `users` table, write them once on first login, and backfill existing users via a one-off Deno script run across all 34 instance containers.

---

## Part 1: Schema + Code Changes (already implemented)

### 1. DB Migration
**File:** `server/db/migrations/instance/017_add_user_names.sql` ✅
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;
```

### 2. `DBUser` type
**File:** `server/db/instance/_main_database_types.ts` ✅
```ts
first_name: string | null;
last_name: string | null;
```

### 3. `OtherUser` type
**File:** `lib/types/instance.ts` ✅
```ts
export type OtherUser = {
  email: string;
  isGlobalAdmin: boolean;
  firstName?: string;
  lastName?: string;
} & UserPermissions;
```

### 4. `getInstanceUsers` maps names
**File:** `server/db/instance/instance.ts` ✅
```ts
firstName: rawUser.first_name ?? undefined,
lastName: rawUser.last_name ?? undefined,
```

### 5. Write name once on first login
**File:** `server/project_auth.ts` ✅

Inside `getGlobalUser`, after fetching `rawUser`, write name from Clerk session claims only when `first_name IS NULL`:
```ts
if (rawUser && rawUser.first_name === null) {
  const firstName = (auth.sessionClaims.firstName as string | undefined) ?? null;
  const lastName = (auth.sessionClaims.lastName as string | undefined) ?? null;
  mainDb`
    UPDATE users SET first_name = ${firstName}, last_name = ${lastName}
    WHERE email = ${email}
  `.catch(() => {});
}
```

### 6. Name column in user table
**File:** `client/src/components/instance/instance_users.tsx` ✅

- `UserData` type gets `firstName?: string; lastName?: string;`
- New column added before Email:
```ts
{
  key: "firstName",
  header: t3({ en: "Name", fr: "Nom" }),
  sortable: true,
  render: (user) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    return name
      ? <span class="text-sm">{name}</span>
      : <span class="text-neutral text-sm">—</span>;
  },
},
```

---

## Part 2: Backfill Script (to be implemented)

Populates names for all existing users across all 34 instances by calling the Clerk API.

### Files to create

**`server/scripts/backfill_user_names.ts`**

Self-contained Deno script (uses inline `npm:` specifiers — no import map needed):
- Connects to the `main` Postgres DB using `PG_HOST`, `PG_PORT`, `PG_PASSWORD` from env
- Fetches all users where `first_name IS NULL`
- Batches emails in groups of 100, calls `GET https://api.clerk.com/v1/users?email_address[]=...` with `CLERK_SECRET_KEY`
- Updates `first_name` / `last_name` for matched users (only where still null, safe to re-run)
- Logs each result and prints a summary

```ts
import postgres from "npm:postgres@^3.4.5";

const PG_HOST = Deno.env.get("PG_HOST")!;
const PG_PORT = Number(Deno.env.get("PG_PORT") ?? "5432");
const PG_PASSWORD = Deno.env.get("PG_PASSWORD")!;
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY")!;

if (!PG_HOST || !PG_PASSWORD || !CLERK_SECRET_KEY) {
  console.error("Missing required env vars: PG_HOST, PG_PASSWORD, CLERK_SECRET_KEY");
  Deno.exit(1);
}

const sql = postgres({
  user: "postgres",
  hostname: PG_HOST,
  password: PG_PASSWORD,
  port: PG_PORT,
  database: "main",
});

const rows = await sql<{ email: string }[]>`
  SELECT email FROM users WHERE first_name IS NULL
`;

if (rows.length === 0) {
  console.log("No users with missing names. Done.");
  await sql.end();
  Deno.exit(0);
}

console.log(`Found ${rows.length} users to backfill...`);

const BATCH_SIZE = 100;
let updated = 0;
let notFound = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const params = new URLSearchParams();
  for (const row of batch) {
    params.append("email_address[]", row.email);
  }

  const res = await fetch(
    `https://api.clerk.com/v1/users?${params}&limit=${BATCH_SIZE}`,
    { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } },
  );

  if (!res.ok) {
    console.error(`Clerk API error: ${res.status} ${await res.text()}`);
    await sql.end();
    Deno.exit(1);
  }

  const clerkUsers = await res.json() as {
    email_addresses: { email_address: string }[];
    first_name: string | null;
    last_name: string | null;
  }[];

  for (const clerkUser of clerkUsers) {
    const email = clerkUser.email_addresses[0]?.email_address;
    if (!email) continue;

    await sql`
      UPDATE users
      SET first_name = ${clerkUser.first_name}, last_name = ${clerkUser.last_name}
      WHERE email = ${email} AND first_name IS NULL
    `;
    console.log(`  ✓ ${email} → ${clerkUser.first_name} ${clerkUser.last_name}`);
    updated++;
  }

  const foundEmails = new Set(
    clerkUsers.flatMap((u) => u.email_addresses.map((e) => e.email_address)),
  );
  for (const row of batch) {
    if (!foundEmails.has(row.email)) {
      console.log(`  - ${row.email} → not in Clerk (skipped)`);
      notFound++;
    }
  }
}

console.log(`\nDone. Updated: ${updated}, not in Clerk: ${notFound}`);
await sql.end();
```

---

**`server/scripts/run_backfill.sh`**

Loops over all 34 container names, copies the script in, runs it, then removes it:

```bash
#!/bin/bash
set -e

CONTAINERS=(
  # paste your 34 container names here
)

SCRIPT_PATH="$(dirname "$0")/backfill_user_names.ts"

for container in "${CONTAINERS[@]}"; do
  echo ""
  echo "=== $container ==="
  docker cp "$SCRIPT_PATH" "$container:/tmp/backfill_user_names.ts"
  docker exec "$container" deno run --allow-net --allow-env /tmp/backfill_user_names.ts
  docker exec "$container" rm /tmp/backfill_user_names.ts
done

echo ""
echo "All instances done."
```

---

## Verification

1. Deploy the new server version to one instance, log in — check that `first_name`/`last_name` are written to the `users` table.
2. Navigate to the Users admin page — Name column appears, shows your name.
3. Fill in container names in `run_backfill.sh`, run it — check output shows `✓` for each user.
4. Reload the Users page on a few instances — existing users now show names.
5. Run `deno task typecheck` to confirm no type errors.
