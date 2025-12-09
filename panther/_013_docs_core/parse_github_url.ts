// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ParsedGitHubUrl } from "./types.ts";

// ================================================================================
// EXPORTED FUNCTIONS
// ================================================================================

export function parseGitHubUrl(url: string): ParsedGitHubUrl {
  const parsed = new URL(url);

  if (parsed.hostname !== "github.com") {
    throw new Error(
      `Invalid GitHub URL: expected github.com, got ${parsed.hostname}`,
    );
  }

  const pathParts = parsed.pathname.split("/").filter((p) => p !== "");

  if (pathParts.length < 2) {
    throw new Error(
      `Invalid GitHub URL: expected at least owner/repo, got ${parsed.pathname}`,
    );
  }

  const owner = pathParts[0];
  const repo = pathParts[1];

  let branch = "main";
  let docsPath = "";

  if (pathParts.length > 2) {
    if (pathParts[2] === "tree" && pathParts.length > 3) {
      branch = pathParts[3];
      if (pathParts.length > 4) {
        docsPath = pathParts.slice(4).join("/");
      }
    } else if (pathParts[2] === "blob" && pathParts.length > 3) {
      branch = pathParts[3];
      if (pathParts.length > 4) {
        docsPath = pathParts.slice(4).join("/");
      }
    }
  }

  return {
    owner,
    repo,
    branch,
    docsPath,
  };
}

export function buildRawGitHubUrl(
  parsed: ParsedGitHubUrl,
  filePath: string,
): string {
  const basePath = parsed.docsPath
    ? `${parsed.docsPath}/${filePath}`
    : filePath;
  return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${basePath}`;
}

export function buildGitHubTreeApiUrl(parsed: ParsedGitHubUrl): string {
  return `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${parsed.branch}?recursive=1`;
}
