// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, Show } from "./deps.ts";
import type { NavItem, NavSection } from "./deps.ts";
import type { DocsBreadcrumbsProps } from "./types.ts";

// ================================================================================
// EXPORTED COMPONENT
// ================================================================================

export function DocsBreadcrumbs(p: DocsBreadcrumbsProps) {
  const breadcrumbs = createMemo(() =>
    buildBreadcrumbs(p.navigation, p.currentSlug)
  );

  return (
    <Show when={breadcrumbs().length > 0} keyed>
      <div class="border-base-300 ui-pad border-b">
        <nav aria-label="Breadcrumb">
          <ol class="flex items-center gap-2 text-sm">
            <For each={breadcrumbs()}>
              {(crumb, index) => (
                <>
                  <li>
                    <Show
                      when={index() < breadcrumbs().length - 1}
                      fallback={
                        <span class="text-base-content font-700">
                          {crumb.label}
                        </span>
                      }
                      keyed
                    >
                      <span class="text-base-content/60">{crumb.label}</span>
                    </Show>
                  </li>
                  <Show when={index() < breadcrumbs().length - 1} keyed>
                    <li class="text-base-content/40">/</li>
                  </Show>
                </>
              )}
            </For>
          </ol>
        </nav>
      </div>
    </Show>
  );
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

type Breadcrumb = {
  label: string;
  slug: string;
};

function buildBreadcrumbs(
  navigation: NavSection[],
  currentSlug: string,
): Breadcrumb[] {
  if (!currentSlug) {
    return [];
  }

  for (const section of navigation) {
    const result = findInSection(section, currentSlug, []);
    if (result) {
      return result;
    }
  }

  return [];
}

function findInSection(
  section: NavSection,
  targetSlug: string,
  path: Breadcrumb[],
): Breadcrumb[] | null {
  for (const item of section.items) {
    const result = findInItem(item, targetSlug, [...path]);
    if (result) {
      return result;
    }
  }
  return null;
}

function findInItem(
  item: NavItem,
  targetSlug: string,
  path: Breadcrumb[],
): Breadcrumb[] | null {
  const currentPath = [...path, { label: item.label, slug: item.slug }];

  if (item.slug === targetSlug) {
    return currentPath;
  }

  if (item.children) {
    for (const child of item.children) {
      const result = findInItem(child, targetSlug, currentPath);
      if (result) {
        return result;
      }
    }
  }

  return null;
}
