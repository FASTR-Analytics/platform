// ============================================================================
// Asset Types
// ============================================================================

// A launched import run's byte pin on its input asset: stamped server-side at
// launch validation (Deno.stat) and re-checked at every deferred read, so an
// overwrite-after-launch fails loudly instead of silently swapping the bytes.
// Lives in stored run configs only: never in client-sent bodies.
export type AssetFilePin = {
  size: number;
  mtimeMs: number;
};

export type AssetInfo = {
  fileName: string;
  size: number;
  lastModified: number;
  isDirectory: boolean;
  isCsv: boolean;
  isXlsx: boolean;
  isImage: boolean;
  isZip: boolean;
  uploaderEmail: string | null;
  privacy: AssetPrivacy | null;
};
// A private asset is visible only to its owner and the viewers they chose.
// Admins get no bypass: the one exception is an asset whose owner account
// has been deleted (ownerIsUser false), which admins can see and manage so it
// is never stranded. canUserSeeAsset is the one rule; the server applies it
// to lists, downloads, overwrites and every by-name asset read.
export type AssetPrivacy = {
  ownerEmail: string;
  viewerEmails: string[];
  ownerIsUser: boolean;
};

export function canUserSeeAsset(
  privacy: AssetPrivacy | null,
  email: string,
  isGlobalAdmin: boolean,
): boolean {
  if (privacy === null) return true;
  return privacy.ownerEmail === email ||
    privacy.viewerEmails.includes(email) ||
    (isGlobalAdmin && !privacy.ownerIsUser);
}

// Who may change a private asset's viewers, make it public again, overwrite
// it or delete it: the owner, or an admin once the owner account is gone.
// Viewers can only read.
export function canUserManagePrivateAsset(
  privacy: AssetPrivacy,
  email: string,
  isGlobalAdmin: boolean,
): boolean {
  return privacy.ownerEmail === email ||
    (isGlobalAdmin && !privacy.ownerIsUser);
}
