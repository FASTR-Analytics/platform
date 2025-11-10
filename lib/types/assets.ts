// ============================================================================
// Asset Types
// ============================================================================

export type AssetInfo = {
  fileName: string;
  size: number;
  lastModified: number;
  isDirectory: boolean;
  isCsv: boolean;
  isImage: boolean;
};