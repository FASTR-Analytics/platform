// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createSignal } from "./deps.ts";
import { MarkdownPresentation, StateHolderWrapper, timQuery } from "./deps.ts";
import type { DocsContentProps } from "./types.ts";

// ================================================================================
// EXPORTED COMPONENT
// ================================================================================

export function DocsContent(p: DocsContentProps) {
  const [currentFetchSlug, setCurrentFetchSlug] = createSignal(p.currentSlug);

  const contentQuery = timQuery(() =>
    fetchMarkdown(currentFetchSlug(), p.basePath),
  );

  createEffect(() => {
    const newSlug = p.currentSlug;
    if (newSlug !== currentFetchSlug()) {
      setCurrentFetchSlug(newSlug);
      contentQuery.silentFetch();
    }
  });

  return (
    <div class="h-full overflow-auto">
      <StateHolderWrapper state={contentQuery.state()} noPad>
        {(data) => (
          <div class="ui-pad-lg mx-auto max-w-4xl">
            <MarkdownPresentation markdown={data} />
          </div>
        )}
      </StateHolderWrapper>
    </div>
  );
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

async function fetchMarkdown(slug: string, basePath?: string) {
  try {
    const base = basePath ?? "/docs";
    const path = !slug
      ? "README.md"
      : slug.endsWith(".md")
        ? slug
        : `${slug}.md`;
    const url = `${base}/${path}`;

    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false as const,
        err: `Failed to fetch markdown: ${response.statusText}`,
      };
    }

    const data = await response.text();
    return { success: true as const, data };
  } catch (err) {
    return {
      success: false as const,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}
