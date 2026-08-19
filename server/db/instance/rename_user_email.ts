import { Sql } from "postgres";
import {
  type APIResponseNoData,
  type APIResponseWithData,
  type AuthorRun,
  type DeckSlideEditors,
  parseJsonOrThrow,
  type VersionEditor,
} from "lib";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import {
  DBDeckVersion,
  DBReportVersion,
  DBUser,
} from "./_main_database_types.ts";

// =============================================================================
// User email rename
// =============================================================================
//
// users.email is the PRIMARY KEY, referenced everywhere permissions, logs and
// attribution live — so an email change is an account rename, not a column
// update. Every FK to users(email) is ON DELETE CASCADE with no ON UPDATE
// CASCADE, which forces the shape of the rename: insert a copy of the row
// under the new email, repoint every child row, then delete the old row (whose
// cascade then has nothing left to take). A plain UPDATE would violate the
// FKs; delete-then-re-add would cascade permissions and history away.
//
// Product attribution (products.created_by, live report authorship, version
// editors/author runs) stores emails as plain strings with no FK, so a second
// sweep rewrites those. Both halves are idempotent: renaming an email that is
// no longer present touches nothing, so a partially-failed fleet run can
// simply be retried.

// ---------------------------------------------------------------------------
// Users row + FK children
// ---------------------------------------------------------------------------

// FK children of users(email) — repointed in the transaction and asserted
// empty right before the old row is deleted, so a future FK added without
// updating this list fails the rename loudly instead of letting the delete
// cascade rows away silently.
const USERS_FK_CHILDREN = [
  { table: "user_logs", column: "user_email" },
  { table: "user_logs_aggregate", column: "user_email" },
  { table: "ai_usage_logs", column: "user_email" },
  { table: "custom_prompts", column: "created_by" },
  { table: "asset_metadata", column: "uploader_email" },
  { table: "personal_access_tokens", column: "user_email" },
] as const;

/** Which of the two addresses exist as users here — drives the fleet
 *  orchestrator's dry-run preview and its decision to run the local rename. */
export async function getUserEmailPresence(
  mainDb: Sql,
  oldEmail: string,
  newEmail: string,
): Promise<{ hasOld: boolean; hasNew: boolean }> {
  const rows = await mainDb<{ email: string }[]>`
    SELECT email FROM users WHERE email IN (${oldEmail}, ${newEmail})
  `;
  const emails = rows.map((r) => r.email);
  return { hasOld: emails.includes(oldEmail), hasNew: emails.includes(newEmail) };
}

export async function renameUserEmailInMainDb(
  mainDb: Sql,
  oldEmail: string,
  newEmail: string,
  actor: string,
): Promise<APIResponseWithData<{ changed: boolean }>> {
  return await tryCatchDatabaseAsync(async () => {
    const oldRow = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${oldEmail}`
    ).at(0);
    const newRow = (
      await mainDb<DBUser[]>`SELECT * FROM users WHERE email = ${newEmail}`
    ).at(0);
    if (oldRow && newRow) {
      return {
        success: false,
        err: "A user with the new email already exists on this instance",
      };
    }
    if (!oldRow && !newRow) {
      return {
        success: false,
        err: "No user with this email on this instance",
      };
    }
    if (!oldRow) {
      // Already renamed (e.g. a retried fleet run) — succeed without touching
      // the users row; the caller still runs the attribution sweeps.
      return { success: true, data: { changed: false } };
    }

    await mainDb.begin(async (sql) => {
      await sql`INSERT INTO users ${sql({ ...oldRow, email: newEmail })}`;
      await sql`UPDATE user_logs SET user_email = ${newEmail} WHERE user_email = ${oldEmail}`;
      await sql`UPDATE user_logs_aggregate SET user_email = ${newEmail} WHERE user_email = ${oldEmail}`;
      await sql`UPDATE ai_usage_logs SET user_email = ${newEmail} WHERE user_email = ${oldEmail}`;
      // Composite PK, no FK — rows under the new email may already exist
      // (leftovers of a previously-deleted account), so merge instead of a
      // blind UPDATE that could hit a unique violation.
      await sql`
        INSERT INTO ai_limit_hits (user_email, limit_type, hit_date)
        SELECT ${newEmail}, limit_type, hit_date
        FROM ai_limit_hits WHERE user_email = ${oldEmail}
        ON CONFLICT DO NOTHING
      `;
      await sql`DELETE FROM ai_limit_hits WHERE user_email = ${oldEmail}`;
      await sql`UPDATE custom_prompts SET created_by = ${newEmail} WHERE created_by = ${oldEmail}`;
      await sql`UPDATE asset_metadata SET uploader_email = ${newEmail} WHERE uploader_email = ${oldEmail}`;
      await sql`UPDATE personal_access_tokens SET user_email = ${newEmail} WHERE user_email = ${oldEmail}`;
      await sql`UPDATE dataset_hmis_scheduled_imports SET created_by = ${newEmail} WHERE created_by = ${oldEmail}`;
      await sql`UPDATE dataset_hmis_import_runs SET triggered_by = ${newEmail} WHERE triggered_by = ${oldEmail}`;
      await sql`UPDATE instance_dhis2_credentials SET updated_by = ${newEmail} WHERE updated_by = ${oldEmail}`;

      for (const { table, column } of USERS_FK_CHILDREN) {
        const remaining = await sql`
          SELECT 1 FROM ${sql(table)} WHERE ${sql(column)} = ${oldEmail} LIMIT 1
        `;
        if (remaining.length > 0) {
          throw new Error(
            `Email rename left ${table}.${column} rows behind — aborting so the users delete cannot cascade them away`,
          );
        }
      }
      await sql`DELETE FROM users WHERE email = ${oldEmail}`;

      // Written inside the transaction (keyed to the new email, which now
      // exists) so machine-authenticated calls leave an audit row too — the
      // log() middleware's fire-and-forget insert has no valid user_email FK
      // target on that path.
      await sql`
        INSERT INTO user_logs (user_email, endpoint, endpoint_result, details)
        VALUES (${newEmail}, ${"renameUserEmail"}, ${"200"}, ${
      JSON.stringify({ oldEmail, newEmail, actor })
    })
      `;
    });

    return { success: true, data: { changed: true } };
  });
}

// ---------------------------------------------------------------------------
// Product attribution sweep
// ---------------------------------------------------------------------------

/** Rewrite the email in every product-attribution column: products.created_by,
 *  the live reports.body_authors ledger, and the frozen version snapshots
 *  (report_versions.editors/body_authors, deck_versions.editors/slide_editors).
 *  All main-DB now, so one transaction covers the lot — it either lands whole
 *  or not at all. Reported rather than thrown: the users row has already
 *  flipped by the time this runs, so a failure here is a retryable warning,
 *  not a failed rename. */
export async function renameUserEmailInProducts(
  mainDb: Sql,
  oldEmail: string,
  newEmail: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`UPDATE products SET created_by = ${newEmail} WHERE created_by = ${oldEmail}`;
      await renameEmailInLiveReportAuthors(sql, oldEmail, newEmail);
      await renameEmailInVersionRows(sql, oldEmail, newEmail);
    });
    return { success: true };
  });
}

/** reports.body_authors is live collab state written by checkpoints, so the
 *  rewrite is a stamp-guarded compare-and-set (same contract as
 *  stripPersistedBodyAuthorTombstones in ../products/reports.ts). Losing the
 *  race is fine: the in-memory ledger is renamed before this sweep runs, so a
 *  concurrent checkpoint already persisted the new email. */
async function renameEmailInLiveReportAuthors(
  sql: Sql,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const rows = await sql<
    {
      id: string;
      body_authors: string;
      crdt_state_last_updated: string | null;
      last_updated: string;
    }[]
  >`
    SELECT r.id, r.body_authors, r.crdt_state_last_updated, p.last_updated
    FROM reports r
    INNER JOIN products p ON p.id = r.id
    WHERE r.body_authors LIKE ${"%" + oldEmail + "%"}
  `;
  for (const row of rows) {
    const res = renameEmailInAuthorRuns(
      parseJsonOrThrow<AuthorRun[]>(row.body_authors),
      oldEmail,
      newEmail,
    );
    if (!res.changed) {
      continue;
    }
    await sql`
      UPDATE reports r
      SET body_authors = ${JSON.stringify(res.runs)}
      FROM products p
      WHERE r.id = ${row.id}
        AND p.id = r.id
        AND p.last_updated = ${row.last_updated}
        AND r.crdt_state_last_updated IS NOT DISTINCT FROM ${row.crdt_state_last_updated}
    `;
  }
}

/** Version snapshots are immutable once written, so plain UPDATEs are safe.
 *  The LIKE prefilter only skips rows the email cannot appear in ("_" in an
 *  email can over-match — harmless, the rewrite then reports unchanged). */
async function renameEmailInVersionRows(
  sql: Sql,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const pattern = "%" + oldEmail + "%";
  const reportRows = await sql<
    Pick<DBReportVersion, "id" | "editors" | "body_authors">[]
  >`
    SELECT id, editors, body_authors FROM report_versions
    WHERE editors LIKE ${pattern} OR body_authors LIKE ${pattern}
  `;
  for (const row of reportRows) {
    const editors = renameEmailInVersionEditors(
      parseJsonOrThrow<VersionEditor[]>(row.editors),
      oldEmail,
      newEmail,
    );
    const bodyAuthors = row.body_authors === null ? null : renameEmailInAuthorRuns(
      parseJsonOrThrow<AuthorRun[]>(row.body_authors),
      oldEmail,
      newEmail,
    );
    if (!editors.changed && !bodyAuthors?.changed) {
      continue;
    }
    await sql`
      UPDATE report_versions
      SET editors = ${JSON.stringify(editors.editors)},
          body_authors = ${bodyAuthors ? JSON.stringify(bodyAuthors.runs) : null}
      WHERE id = ${row.id}
    `;
  }

  const deckRows = await sql<
    Pick<DBDeckVersion, "id" | "editors" | "slide_editors">[]
  >`
    SELECT id, editors, slide_editors FROM deck_versions
    WHERE editors LIKE ${pattern} OR slide_editors LIKE ${pattern}
  `;
  for (const row of deckRows) {
    const editors = renameEmailInVersionEditors(
      parseJsonOrThrow<VersionEditor[]>(row.editors),
      oldEmail,
      newEmail,
    );
    const slideEditors = row.slide_editors === null
      ? null
      : renameEmailInDeckSlideEditors(
        parseJsonOrThrow<DeckSlideEditors>(row.slide_editors),
        oldEmail,
        newEmail,
      );
    if (!editors.changed && !slideEditors?.changed) {
      continue;
    }
    await sql`
      UPDATE deck_versions
      SET editors = ${JSON.stringify(editors.editors)},
          slide_editors = ${slideEditors ? JSON.stringify(slideEditors.dse) : null}
      WHERE id = ${row.id}
    `;
  }
}

// ---------------------------------------------------------------------------
// Pure attribution rewriters
// ---------------------------------------------------------------------------
//
// Shared with the in-memory collab sweep (the collab modules rename their live
// ledgers with these before the DB sweep runs). Every function returns
// `changed` so callers skip writes for untouched rows.

export function renameEmailInAuthorRuns(
  runs: AuthorRun[],
  oldEmail: string,
  newEmail: string,
): { runs: AuthorRun[]; changed: boolean } {
  let changed = false;
  const next = runs.map((run) => {
    const emailHit = run.email === oldEmail;
    const deletedByHit = run.deletedBy === oldEmail;
    if (!emailHit && !deletedByHit) {
      return run;
    }
    changed = true;
    return {
      ...run,
      ...(emailHit ? { email: newEmail } : {}),
      ...(deletedByHit ? { deletedBy: newEmail } : {}),
    };
  });
  return { runs: changed ? next : runs, changed };
}

/** If the new email is already listed (e.g. a partially-renamed session), the
 *  old entry is dropped instead of duplicated. */
export function renameEmailInVersionEditors(
  editors: VersionEditor[],
  oldEmail: string,
  newEmail: string,
): { editors: VersionEditor[]; changed: boolean } {
  if (!editors.some((e) => e.email === oldEmail)) {
    return { editors, changed: false };
  }
  const hasNew = editors.some((e) => e.email === newEmail);
  const next: VersionEditor[] = [];
  for (const editor of editors) {
    if (editor.email !== oldEmail) {
      next.push(editor);
    } else if (!hasNew) {
      next.push({ ...editor, email: newEmail });
    }
  }
  return { editors: next, changed: true };
}

function renameEmailInList(
  emails: string[],
  oldEmail: string,
  newEmail: string,
): { emails: string[]; changed: boolean } {
  if (!emails.includes(oldEmail)) {
    return { emails, changed: false };
  }
  const next = new Set(emails.map((e) => (e === oldEmail ? newEmail : e)));
  return { emails: [...next], changed: true };
}

function renameEmailInListRecord(
  record: Record<string, string[]>,
  oldEmail: string,
  newEmail: string,
): { record: Record<string, string[]>; changed: boolean } {
  let changed = false;
  const next: Record<string, string[]> = {};
  for (const [key, emails] of Object.entries(record)) {
    const res = renameEmailInList(emails, oldEmail, newEmail);
    changed = changed || res.changed;
    next[key] = res.emails;
  }
  return { record: changed ? next : record, changed };
}

export function renameEmailInDeckSlideEditors(
  dse: DeckSlideEditors,
  oldEmail: string,
  newEmail: string,
): { dse: DeckSlideEditors; changed: boolean } {
  let changed = false;
  const slides: DeckSlideEditors["slides"] = {};
  for (const [slideId, slide] of Object.entries(dse.slides)) {
    const next: DeckSlideEditors["slides"][string] = { ...slide };
    for (const key of ["edited", "added", "removed"] as const) {
      const emails = slide[key];
      if (emails) {
        const res = renameEmailInList(emails, oldEmail, newEmail);
        changed = changed || res.changed;
        next[key] = res.emails;
      }
    }
    for (
      const key of [
        "elements",
        "elementsAdded",
        "elementsRemoved",
        "elementsTextDeleted",
      ] as const
    ) {
      const record = slide[key];
      if (record) {
        const res = renameEmailInListRecord(record, oldEmail, newEmail);
        changed = changed || res.changed;
        next[key] = res.record;
      }
    }
    if (slide.elementAuthors) {
      const nextAuthors: Record<string, AuthorRun[]> = {};
      for (const [elementKey, runs] of Object.entries(slide.elementAuthors)) {
        const res = renameEmailInAuthorRuns(runs, oldEmail, newEmail);
        changed = changed || res.changed;
        nextAuthors[elementKey] = res.runs;
      }
      next.elementAuthors = nextAuthors;
    }
    slides[slideId] = next;
  }
  const result: DeckSlideEditors = { slides };
  if (dse.settings) {
    const res = renameEmailInList(dse.settings, oldEmail, newEmail);
    changed = changed || res.changed;
    result.settings = res.emails;
  }
  if (dse.reordered) {
    const res = renameEmailInList(dse.reordered, oldEmail, newEmail);
    changed = changed || res.changed;
    result.reordered = res.emails;
  }
  return { dse: changed ? result : dse, changed };
}
