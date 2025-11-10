// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { useNavigate } from "@solidjs/router";

export function useSmartNavigate() {
  const navigate = useNavigate();

  return (
    url: string,
    forceRefreshIfSameKeys: "force-refresh-if-same-keys" | undefined,
  ) => {
    const currentParams = new URLSearchParams(window.location.search);
    const newUrl = new URL(url, window.location.origin);
    const newParams = new URLSearchParams(newUrl.search);

    // Get sorted keys from both
    const currentKeys = Array.from(currentParams.keys()).sort();
    const newKeys = Array.from(newParams.keys()).sort();

    // If keys are the same (same structure), force a full page refresh
    if (
      forceRefreshIfSameKeys === "force-refresh-if-same-keys" &&
      currentKeys.length === newKeys.length &&
      currentKeys.every((key, i) => key === newKeys[i])
    ) {
      window.location.href = url;
    } else {
      // Otherwise use client-side navigation
      navigate(url);
    }
  };
}
