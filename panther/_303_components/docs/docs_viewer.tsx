// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createSignal } from "./deps.ts";
import { FrameLeftResizable, StateHolderWrapper, timQuery } from "./deps.ts";
import type { DocsManifest } from "./deps.ts";
import type { DocsViewerProps } from "./types.ts";
import { DocsSidebar } from "./docs_sidebar.tsx";
import { DocsContent } from "./docs_content.tsx";

// ================================================================================
// EXPORTED COMPONENT
// ================================================================================

export function DocsViewer(p: DocsViewerProps) {
  const [currentSlug, setCurrentSlug] = createSignal("");

  const manifestQuery = timQuery(
    () => fetchManifest(p.manifestUrl),
    "Loading documentation...",
  );

  createEffect(() => {
    const state = manifestQuery.state();
    if (
      state.status === "ready" &&
      currentSlug() === "" &&
      state.data.pages.length > 0
    ) {
      setCurrentSlug(state.data.pages[0].slug);
    }
  });

  const handleNavigate = (slug: string) => {
    setCurrentSlug(slug);
  };

  return (
    <StateHolderWrapper state={manifestQuery.state()}>
      {(data) => (
        <FrameLeftResizable
          minWidth={240}
          startingWidth={320}
          maxWidth={500}
          preventPanelResizeOnParentResize
          panelChildren={
            <DocsSidebar
              rootItems={data.rootItems}
              navigation={data.navigation}
              currentSlug={currentSlug()}
              onNavigate={handleNavigate}
            />
          }
        >
          <DocsContent currentSlug={currentSlug()} basePath={p.basePath} />
        </FrameLeftResizable>
      )}
    </StateHolderWrapper>
  );
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

async function fetchManifest(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false as const,
        err: `Failed to fetch manifest: ${response.statusText}`,
      };
    }
    const data: DocsManifest = await response.json();
    return { success: true as const, data };
  } catch (err) {
    return {
      success: false as const,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}
