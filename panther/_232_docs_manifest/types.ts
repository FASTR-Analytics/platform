// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// ================================================================================
// OPTIONS TYPES (specific to _232 manifest generation)
// ================================================================================

export type GenerateDocsManifestOptions = {
  inputDir: string;
  title?: string;
  excludeFromManifest?: string[];
  preferSentenceCase?: boolean;
};

export type CopyDocsOptions = {
  sourceDir: string;
  outputDir: string;
  urlPrefix: string;
};
