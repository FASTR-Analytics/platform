// Migration 225: every users.email is stored normalised (trimmed, lowercased),
// as every write and the login claim now normalise it, so a mixed-case row
// would otherwise never match its owner's sign-in again. Each row whose email
// is not normalised is moved to the normalised address with everything that
// names it, through the rename's own repoint. A row whose normalised address
// already exists is a second account for the same person: merging two
// accounts is a decision, so it is logged and left as it is.

import type { Sql } from "postgres";
import { normaliseEmail } from "lib";
import {
  repointProductAttribution,
  repointUserEmail,
} from "../../instance/rename_user_email.ts";

export async function lowercaseUserEmails(tx: Sql): Promise<void> {
  const rows = await tx<{ email: string }[]>`
    SELECT email FROM users ORDER BY email
  `;
  for (const { email } of rows) {
    const normalised = normaliseEmail(email);
    if (normalised === email) continue;
    const twin = await tx`SELECT 1 FROM users WHERE email = ${normalised}`;
    if (twin.length > 0) {
      console.warn(
        `[225_lowercase_user_emails] skipped ${email}: ${normalised} already exists`,
      );
      continue;
    }
    await repointUserEmail(tx, email, normalised);
    await repointProductAttribution(tx, email, normalised);
  }
}
