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
    fetchMarkdown(currentFetchSlug(), p.pages, p.basePath),
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
      <StateHolderWrapper state={contentQuery.state()}>
        {(data) => (
          <div class="mx-auto max-w-4xl px-12 py-16">
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

async function fetchMarkdown(
  slug: string,
  pages: DocsContentProps["pages"],
  basePath?: string,
) {
  try {
    const base = basePath ?? "/docs";

    // Find the page by slug and use its filePath
    const page = pages.find((p) => p.slug === slug);
    if (!page) {
      return {
        success: false as const,
        err: `Page not found for slug: ${slug}`,
      };
    }

    const url = `${base}/${page.filePath}`;

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
