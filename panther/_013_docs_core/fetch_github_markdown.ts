// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ParsedGitHubUrl } from "./types.ts";
import { buildRawGitHubUrl } from "./parse_github_url.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export async function fetchGitHubMarkdown(
  parsed: ParsedGitHubUrl,
  filePath: string,
): Promise<string> {
  const url = buildRawGitHubUrl(parsed, filePath);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch markdown: ${response.status} ${response.statusText}`,
    );
  }

  const content = await response.text();
  return rewriteImagePaths(content, parsed, filePath);
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function rewriteImagePaths(
  content: string,
  parsed: ParsedGitHubUrl,
  filePath: string,
): string {
  const baseUrl =
    `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}`;
  const docsBase = parsed.docsPath ? `${baseUrl}/${parsed.docsPath}` : baseUrl;

  const fileDir = getDirectory(filePath);
  const currentDir = fileDir ? `${docsBase}/${fileDir}` : docsBase;

  let result = content;

  // Rewrite relative paths: ![alt](./image.png) or ![alt](image.png)
  result = result.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/|\/\/)([^)]+)\)/g,
    (match, alt, path) => {
      if (path.startsWith("/")) {
        // Absolute path from repo root: /docs/image.png -> baseUrl/docs/image.png
        return `![${alt}](${baseUrl}${path})`;
      } else if (path.startsWith("./")) {
        // Explicit relative: ./image.png -> currentDir/image.png
        return `![${alt}](${currentDir}/${path.slice(2)})`;
      } else if (path.startsWith("../")) {
        // Parent relative: ../image.png - resolve relative to current dir
        return `![${alt}](${resolveRelativePath(currentDir, path)})`;
      } else {
        // Implicit relative: image.png -> currentDir/image.png
        return `![${alt}](${currentDir}/${path})`;
      }
    },
  );

  return result;
}

function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

function resolveRelativePath(base: string, relativePath: string): string {
  const baseParts = base.split("/");
  const relativeParts = relativePath.split("/");

  for (const part of relativeParts) {
    if (part === "..") {
      baseParts.pop();
    } else if (part !== ".") {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}
