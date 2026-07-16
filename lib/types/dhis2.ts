// Cross-flow DHIS2 credential types (PLAN_DHIS2_CREDENTIAL_STORE_
// CONSOLIDATION). Every DHIS2 flow — structure import, indicators, geojson,
// HMIS data — sources credentials the same way: stored (instance-wide,
// encrypted at rest) or inline (transient, never persisted).

export type Dhis2Credentials = {
  url: string;
  username: string;
  password: string;
};

// How a flow obtains credentials at fetch time. "inline" = supplied per
// request/run (never persisted). "stored" = resolved from the encrypted
// instance credentials, decrypted server-side at fetch time.
export type Dhis2RunCredentialsSource =
  | { kind: "inline"; credentials: Dhis2Credentials }
  | { kind: "stored" };

// The safe projection of the stored instance credentials — neither the
// password nor the username ever leaves the server; the client only needs
// the URL to show what is stored.
export type Dhis2StoredCredentialsInfo = {
  url: string;
  updatedBy: string;
  updatedAt: string;
};

// One GET for the credentials editor: current stored state (if any) plus
// whether the server can store credentials at all.
export type InstanceDhis2CredentialsInfo = {
  storedCredentials?: Dhis2StoredCredentialsInfo;
  // false = DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on the server, so
  // credentials cannot be stored.
  encryptionKeyConfigured: boolean;
};
