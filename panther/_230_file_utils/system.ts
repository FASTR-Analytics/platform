// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function getSystemTempDir(): string {
  // Try environment variables first
  const envTemp = Deno.env.get("TMPDIR") ||
    Deno.env.get("TMP") ||
    Deno.env.get("TEMP") ||
    Deno.env.get("TEMPDIR");

  if (envTemp) {
    return envTemp;
  }

  // Fall back to OS-specific defaults
  switch (Deno.build.os) {
    case "windows":
      return "C:\\Temp";
    case "darwin":
    case "linux":
    case "freebsd":
    case "netbsd":
    case "aix":
    case "solaris":
    case "illumos":
      return "/tmp";
    default:
      return "/tmp";
  }
}

export function getHomeDir(): string {
  const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");
  if (!homeDir) {
    throw new Error(
      "Could not determine home directory. Please set HOME or USERPROFILE environment variable.",
    );
  }
  return homeDir;
}
