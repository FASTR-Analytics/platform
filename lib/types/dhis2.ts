// Cross-flow DHIS2 credential types (PLAN_DHIS2_CREDENTIAL_STORE_
// CONSOLIDATION). Every DHIS2 flow (structure import, indicators, geojson,
// HMIS data) uses the one instance-wide stored connection, encrypted at rest
// and set only in the Data page's DHIS2 connection row.

export type Dhis2Credentials = {
  url: string;
  username: string;
  password: string;
};

export const NO_STORED_DHIS2_CONNECTION = {
  en: "No DHIS2 connection is stored. Set it under DHIS2 connection on the Data page.",
  fr: "Aucune connexion DHIS2 n'est enregistrée. Définissez-la sous Connexion DHIS2, sur la page Données.",
  pt: "Nenhuma ligação DHIS2 está guardada. Defina-a em Ligação DHIS2, na página Dados.",
};

// The safe projection of the stored instance credentials: neither the
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

// What a DHIS2 name refresh did: names rewritten, names already current,
// and the ids of the elements DHIS2 no longer has, left as they were.
export type Dhis2LabelRefresh = {
  refreshed: number;
  unchanged: number;
  notFound: string[];
};
