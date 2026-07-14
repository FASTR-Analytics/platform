import { Sql } from "postgres";
import type { Dhis2Credentials, Dhis2StoredCredentialsInfo } from "lib";
import { _DHIS2_CREDENTIALS_ENCRYPTION_KEY } from "../../exposed_env_vars.ts";
import type { DBDatasetHmisDhis2Credentials } from "./_main_database_types.ts";

// Stored instance DHIS2 credentials (PLAN_DHIS2_IMPORTER Phase 4, C3).
// Single row; url + username are plaintext (the runs table already exposes
// the URL, and the UI shows both so an admin can see what is stored), the
// password is AES-256-GCM encrypted with a key derived from the
// DHIS2_CREDENTIALS_ENCRYPTION_KEY env var. The key never enters the DB, and
// decryption happens ONLY in the run worker at fetch time
// (getStoredDhis2CredentialsDecrypted) — the host process and every route
// handle only the safe projection.

const GCM_IV_BYTES = 12;

export function isDhis2CredentialsEncryptionKeyConfigured(): boolean {
  return _DHIS2_CREDENTIALS_ENCRYPTION_KEY.length > 0;
}

async function getAesKey(): Promise<CryptoKey> {
  if (!isDhis2CredentialsEncryptionKeyConfigured()) {
    throw new Error(
      "DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on this server — stored DHIS2 credentials are unavailable.",
    );
  }
  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(_DHIS2_CREDENTIALS_ENCRYPTION_KEY),
  );
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptDhis2Password(plain: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plain),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  let binary = "";
  for (const byte of combined) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function decryptDhis2Password(encrypted: string): Promise<string> {
  const key = await getAesKey();
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  if (combined.length <= GCM_IV_BYTES) {
    throw new Error("Stored DHIS2 password is malformed.");
  }
  const iv = combined.slice(0, GCM_IV_BYTES);
  const ciphertext = combined.slice(GCM_IV_BYTES);
  try {
    const plainBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plainBytes);
  } catch {
    throw new Error(
      "Could not decrypt the stored DHIS2 password — the encryption key has changed. Re-save the DHIS2 credentials.",
    );
  }
}

export async function getStoredDhis2CredentialsInfo(
  mainDb: Sql,
): Promise<Dhis2StoredCredentialsInfo | null> {
  const rows = await mainDb<DBDatasetHmisDhis2Credentials[]>`
    SELECT singleton, url, username, password_encrypted, updated_by, updated_at
    FROM dataset_hmis_dhis2_credentials
  `;
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  return {
    url: row.url,
    username: row.username,
    updatedBy: row.updated_by,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveStoredDhis2Credentials(
  mainDb: Sql,
  credentials: Dhis2Credentials,
  updatedBy: string,
): Promise<void> {
  const passwordEncrypted = await encryptDhis2Password(credentials.password);
  await mainDb`
    INSERT INTO dataset_hmis_dhis2_credentials
      (singleton, url, username, password_encrypted, updated_by, updated_at)
    VALUES (true, ${credentials.url}, ${credentials.username},
      ${passwordEncrypted}, ${updatedBy}, now())
    ON CONFLICT (singleton) DO UPDATE SET
      url = EXCLUDED.url,
      username = EXCLUDED.username,
      password_encrypted = EXCLUDED.password_encrypted,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function deleteStoredDhis2Credentials(mainDb: Sql): Promise<void> {
  await mainDb`DELETE FROM dataset_hmis_dhis2_credentials`;
}

// The ONLY reader of the plaintext password. Called from the run worker at
// fetch time (never from a route or the scheduler tick).
export async function getStoredDhis2CredentialsDecrypted(
  mainDb: Sql,
): Promise<Dhis2Credentials> {
  const rows = await mainDb<DBDatasetHmisDhis2Credentials[]>`
    SELECT singleton, url, username, password_encrypted, updated_by, updated_at
    FROM dataset_hmis_dhis2_credentials
  `;
  const row = rows.at(0);
  if (!row) {
    throw new Error(
      "No stored DHIS2 credentials — save credentials in the DHIS2 imports view first.",
    );
  }
  return {
    url: row.url,
    username: row.username,
    password: await decryptDhis2Password(row.password_encrypted),
  };
}
