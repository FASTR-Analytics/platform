// ============================================================================
// Asset Types
// ============================================================================

// A launched import run's byte pin on its input asset: stamped server-side at
// launch validation (Deno.stat) and re-checked at every deferred read, so an
// overwrite-after-launch fails loudly instead of silently swapping the bytes.
// Lives in stored run configs only — never in client-sent bodies.
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
};