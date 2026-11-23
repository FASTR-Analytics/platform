import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  type GlobalUser,
  normaliseEmail,
  type Team,
} from "lib";
import { TEAM_SELF_ADD_REFUSED } from "../../auth/refusals.ts";
import { tryCatchDatabaseAsync } from "../utils.ts";
import type { DBTeam } from "./_main_database_types.ts";

export const TEAM_NOT_FOUND = "Team not found";
export const TEAM_LABEL_TAKEN = "Another team already has this name";
export const TEAM_UNKNOWN_USER =
  "Only a user of this instance can be in a team";
const TEAM_LABEL_EMPTY = "A team needs a name";

// A caller who is not a global admin never adds themselves to a team, which
// would hand them every level the team holds; leaving one only lowers their
// access, so it is allowed. Membership changes nothing for a global admin.
export type TeamCaller = Pick<GlobalUser, "email" | "isGlobalAdmin">;

type DBTeamWithCount = DBTeam & { product_count: number };

// Every team, with the number of products that grant it a level.
export async function listTeams(
  mainDb: Sql,
): Promise<APIResponseWithData<Team[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<DBTeamWithCount[]>`
      SELECT
        t.*,
        (
          SELECT COUNT(*) FROM product_team_access pta WHERE pta.team_id = t.id
        )::int AS product_count
      FROM teams t
      ORDER BY LOWER(t.label), t.id
    `;
    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        label: row.label,
        description: row.description,
        productCount: row.product_count,
      })),
    };
  });
}

// The teams of the named users, or of every user, in one read; each list is
// ordered, so two reads of an unchanged membership are equal.
export async function getTeamIdsByEmail(
  mainDb: Sql,
  emails?: string[],
): Promise<Map<string, string[]>> {
  const rows = emails === undefined
    ? await mainDb<{ email: string; team_id: string }[]>`
        SELECT email, team_id FROM team_members ORDER BY team_id
      `
    : await mainDb<{ email: string; team_id: string }[]>`
        SELECT email, team_id FROM team_members
        WHERE email = ANY(${emails})
        ORDER BY team_id
      `;
  const teams = new Map<string, string[]>();
  for (const row of rows) {
    const held = teams.get(row.email);
    if (held === undefined) {
      teams.set(row.email, [row.team_id]);
    } else {
      held.push(row.team_id);
    }
  }
  return teams;
}

type TeamArgs = {
  label: string;
  description: string | null;
  memberEmails: string[];
};

export async function createTeam(
  mainDb: Sql,
  caller: TeamCaller,
  args: TeamArgs,
): Promise<APIResponseWithData<{ teamId: string; hasMembers: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const teamId = crypto.randomUUID();
    const label = normaliseLabel(args.label);
    const description = normaliseDescription(args.description);
    const emails = uniqueEmails(args.memberEmails);
    const stamp = new Date().toISOString();
    const refusal = await mainDb.begin(async (sql) => {
      const refused = await refuseLabel(sql, label, null) ??
        await refuseAdding(sql, caller, emails);
      if (refused !== undefined) {
        return refused;
      }
      await sql`
        INSERT INTO teams (id, label, description, created_by, created_at)
        VALUES (${teamId}, ${label}, ${description}, ${caller.email}, ${stamp})
      `;
      await insertMembers(sql, teamId, emails);
      return undefined;
    });
    return refusal === undefined
      ? { success: true, data: { teamId, hasMembers: emails.length > 0 } }
      : { success: false, err: refusal };
  });
}

// Replaces the label, the description and the whole member list.
// `membersChanged` says whether anyone joined or left, which is when the
// roster has to be re-broadcast.
export async function updateTeam(
  mainDb: Sql,
  caller: TeamCaller,
  teamId: string,
  args: TeamArgs,
): Promise<APIResponseWithData<{ membersChanged: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const label = normaliseLabel(args.label);
    const description = normaliseDescription(args.description);
    const emails = uniqueEmails(args.memberEmails);
    const result = await mainDb.begin(async (sql) => {
      const missing = await refuseMissingTeam(sql, teamId);
      if (missing !== undefined) {
        return missing;
      }
      const current = new Set(await memberEmails(sql, teamId));
      const wanted = new Set(emails);
      const added = emails.filter((email) => !current.has(email));
      const removed = [...current].filter((email) => !wanted.has(email));
      const refused = await refuseLabel(sql, label, teamId) ??
        await refuseAdding(sql, caller, added);
      if (refused !== undefined) {
        return refused;
      }
      await sql`
        UPDATE teams SET label = ${label}, description = ${description}
        WHERE id = ${teamId}
      `;
      if (removed.length > 0) {
        await sql`
          DELETE FROM team_members
          WHERE team_id = ${teamId} AND email = ANY(${removed})
        `;
      }
      await insertMembers(sql, teamId, added);
      return { membersChanged: added.length > 0 || removed.length > 0 };
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

// The delete cascades the team's memberships and every grant a product gave
// it. Returns the products that lost a grant, for the caller to re-broadcast,
// and whether anyone was in the team.
export async function deleteTeam(
  mainDb: Sql,
  teamId: string,
): Promise<
  APIResponseWithData<{ productIds: string[]; hadMembers: boolean }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb.begin(async (sql) => {
      const missing = await refuseMissingTeam(sql, teamId);
      if (missing !== undefined) {
        return missing;
      }
      const products = await sql<{ product_id: string }[]>`
        SELECT product_id FROM product_team_access WHERE team_id = ${teamId}
      `;
      const members = await memberEmails(sql, teamId);
      await sql`DELETE FROM teams WHERE id = ${teamId}`;
      return {
        productIds: products.map((r) => r.product_id),
        hadMembers: members.length > 0,
      };
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

// Adds only: a named user already in the team is left as they are, and
// `added` counts the users who joined.
export async function addTeamMembers(
  mainDb: Sql,
  caller: TeamCaller,
  teamId: string,
  rawEmails: string[],
): Promise<APIResponseWithData<{ added: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const emails = uniqueEmails(rawEmails);
    const result = await mainDb.begin(async (sql) => {
      const missing = await refuseMissingTeam(sql, teamId);
      if (missing !== undefined) {
        return missing;
      }
      const current = new Set(await memberEmails(sql, teamId));
      const joining = emails.filter((email) => !current.has(email));
      const refused = await refuseAdding(sql, caller, joining);
      if (refused !== undefined) {
        return refused;
      }
      await insertMembers(sql, teamId, joining);
      return { added: joining.length };
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

export async function removeTeamMembers(
  mainDb: Sql,
  teamId: string,
  rawEmails: string[],
): Promise<APIResponseWithData<{ removed: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const emails = uniqueEmails(rawEmails);
    const result = await mainDb.begin(async (sql) => {
      const missing = await refuseMissingTeam(sql, teamId);
      if (missing !== undefined) {
        return missing;
      }
      const rows = await sql`
        DELETE FROM team_members
        WHERE team_id = ${teamId} AND email = ANY(${emails})
        RETURNING email
      `;
      return { removed: rows.length };
    });
    return typeof result === "string"
      ? { success: false, err: result }
      : { success: true, data: result };
  });
}

// Every refusal below is an answer, returned through the envelope, never a
// throw: each is checked before the transaction writes anything, so returning
// it commits nothing.

// Locks the team row, so two writes to one team do not interleave.
async function refuseMissingTeam(
  sql: Sql,
  teamId: string,
): Promise<string | undefined> {
  const existing = await sql`
    SELECT 1 FROM teams WHERE id = ${teamId} FOR UPDATE
  `;
  return existing.length === 0 ? TEAM_NOT_FOUND : undefined;
}

async function memberEmails(sql: Sql, teamId: string): Promise<string[]> {
  const rows = await sql<{ email: string }[]>`
    SELECT email FROM team_members WHERE team_id = ${teamId}
  `;
  return rows.map((r) => r.email);
}

// The two rules on the users a write adds: the caller's own address, unless
// they are a global admin, and an address with no users row are both refused.
// The named rows are share-locked, so a user deleted alongside cannot turn the
// insert into a raw foreign-key error.
async function refuseAdding(
  sql: Sql,
  caller: TeamCaller,
  emails: string[],
): Promise<string | undefined> {
  if (emails.length === 0) {
    return undefined;
  }
  if (!caller.isGlobalAdmin && emails.includes(caller.email)) {
    return TEAM_SELF_ADD_REFUSED;
  }
  const known = await sql<{ email: string }[]>`
    SELECT email FROM users WHERE email = ANY(${emails}) FOR SHARE
  `;
  return known.length === emails.length ? undefined : TEAM_UNKNOWN_USER;
}

async function insertMembers(
  sql: Sql,
  teamId: string,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) {
    return;
  }
  await sql`
    INSERT INTO team_members ${
    sql(emails.map((email) => ({ team_id: teamId, email })))
  }
    ON CONFLICT (team_id, email) DO NOTHING
  `;
}

// Names are how a person picks a team, so two teams never share one.
async function refuseLabel(
  sql: Sql,
  label: string,
  exceptTeamId: string | null,
): Promise<string | undefined> {
  if (label === "") {
    return TEAM_LABEL_EMPTY;
  }
  const taken = await sql`
    SELECT 1 FROM teams
    WHERE LOWER(label) = LOWER(${label})
      AND id IS DISTINCT FROM ${exceptTeamId}
  `;
  return taken.length > 0 ? TEAM_LABEL_TAKEN : undefined;
}

function uniqueEmails(emails: string[]): string[] {
  return [...new Set(emails.map(normaliseEmail))];
}

// What a name is stored as: composed characters, single spaces, and none of
// the invisible characters that carry no meaning in a name, as a scope label
// is stored (server/db/instance/scopes.ts).
function normaliseLabel(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[­​‎‏⁠﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A blank description is stored as null, so "none" has one spelling.
function normaliseDescription(raw: string | null): string | null {
  return raw?.replace(/\s+/g, " ").trim() || null;
}
