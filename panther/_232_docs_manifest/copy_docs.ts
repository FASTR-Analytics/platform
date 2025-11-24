// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { walk } from "./deps.ts";
import type { CopyDocsOptions } from "./types.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export async function copyDocs(options: CopyDocsOptions): Promise<void> {
  const { copy } = await import("@std/fs/copy");
  const { emptyDir } = await import("@std/fs/empty-dir");
  const { ensureDir } = await import("@std/fs/ensure-dir");

  await ensureDir(options.outputDir);
  await emptyDir(options.outputDir);
  await copy(options.sourceDir, options.outputDir, { overwrite: true });
  await rewriteImagePaths(options.outputDir, options.urlPrefix);
}

// ================================================================================
// INTERNAL FUNCTIONS
// ================================================================================

async function rewriteImagePaths(
  docsDir: string,
  urlPrefix: string,
): Promise<void> {
  for await (const entry of walk(docsDir, { exts: [".md"] })) {
    if (!entry.isFile) continue;

    let content = await Deno.readTextFile(entry.path);

    const prefixWithSlash = urlPrefix.endsWith("/")
      ? urlPrefix
      : `${urlPrefix}/`;

    // Rewrite image paths: ![alt](/path) -> ![alt](/urlPrefix/path)
    content = content.replace(
      /!\[([^\]]*)\]\(\/([^)]+)\)/g,
      `![$1](${prefixWithSlash}$2)`,
    );

    // Rewrite markdown doc links: [text](/path.md) -> [text](/urlPrefix/path.md)
    // Only rewrites absolute paths ending in .md (doc links, not app routes)
    content = content.replace(
      /(?<!!)\[([^\]]+)\]\((\/[^)]+\.md)\)/g,
      `[$1](${prefixWithSlash}$2)`,
    );

    await Deno.writeTextFile(entry.path, content);
  }
}
