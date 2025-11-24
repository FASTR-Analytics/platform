// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { NavItem } from "./deps.ts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CollapsibleSection,
  createEffect,
  createSignal,
  For,
  Show,
} from "./deps.ts";
import type { DocsSidebarProps } from "./types.ts";

// ================================================================================
// EXPORTED COMPONENT
// ================================================================================

export function DocsSidebar(p: DocsSidebarProps) {
  const findActiveSection = (): string | null => {
    const section = p.navigation.find((section) =>
      section.items.some((item) => isItemActive(item, p.currentSlug))
    );
    return section ? section.id : null;
  };

  const [openSectionId, setOpenSectionId] = createSignal<string | null>(
    findActiveSection(),
  );

  createEffect(() => {
    const activeSection = findActiveSection();
    if (activeSection) {
      setOpenSectionId(activeSection);
    }
  });

  const handleSectionToggle = (id: string) => {
    setOpenSectionId(openSectionId() === id ? null : id);
  };

  return (
    <div class="bg-base-100 border-base-300 h-full overflow-auto border-r">
      <For each={p.rootItems}>
        {(item) => (
          <CollapsibleSection
            title={item.label}
            borderStyle="none"
            rounded={false}
            boldHeader
            activeHeader={p.currentSlug === item.slug}
            padding="md"
            hideChevron
            onHeaderClick={() => p.onNavigate(item.slug)}
          />
        )}
      </For>
      <For each={p.navigation}>
        {(section) => (
          <CollapsibleSection
            title={section.label}
            isOpen={openSectionId() === section.id}
            onToggle={() => handleSectionToggle(section.id)}
            borderStyle="none"
            rounded={false}
            boldHeader
            padding="md"
            contentBorder={false}
            onHeaderClick={section.slug
              ? () => p.onNavigate(section.slug!)
              : undefined}
            noClickToCollapse={!!section.slug}
          >
            <NavItemsGroup
              items={section.items}
              currentSlug={p.currentSlug}
              onNavigate={p.onNavigate}
              level={0}
            />
          </CollapsibleSection>
        )}
      </For>
    </div>
  );
}

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

function isItemActive(item: NavItem, currentSlug: string): boolean {
  if (item.slug === currentSlug) return true;
  if (item.children) {
    return item.children.some((child) => isItemActive(child, currentSlug));
  }
  return false;
}

// ================================================================================
// INTERNAL COMPONENTS
// ================================================================================

function NavItemsGroup(p: {
  items: NavItem[];
  currentSlug: string;
  onNavigate: (slug: string) => void;
  level: number;
}) {
  const findActiveItemSlug = (currentSlug: string): string | null => {
    const activeItem = p.items.find(
      (item) => item.children && isItemActive(item, currentSlug),
    );
    return activeItem ? activeItem.slug : null;
  };

  const [expandedItemSlug, setExpandedItemSlug] = createSignal<string | null>(
    findActiveItemSlug(p.currentSlug),
  );

  createEffect(() => {
    const currentSlug = p.currentSlug;
    const activeSlug = findActiveItemSlug(currentSlug);
    if (activeSlug) {
      setExpandedItemSlug(activeSlug);
    }
  });

  const handleToggle = (slug: string) => {
    setExpandedItemSlug(expandedItemSlug() === slug ? null : slug);
  };

  return (
    <For each={p.items}>
      {(item) => (
        <NavItemComponent
          item={item}
          currentSlug={p.currentSlug}
          onNavigate={p.onNavigate}
          level={p.level}
          isExpanded={expandedItemSlug() === item.slug}
          onToggle={() => handleToggle(item.slug)}
        />
      )}
    </For>
  );
}

function NavItemComponent(p: {
  item: NavItem;
  currentSlug: string;
  onNavigate: (slug: string) => void;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = () => p.item.children && p.item.children.length > 0;
  const isActive = () => !hasChildren() && p.currentSlug === p.item.slug;

  const handleLabelClick = () => {
    if (hasChildren() && p.item.children) {
      // If this item has children, navigate to a child with matching slug or first child
      const matchingChild = p.item.children.find((c) => c.slug === p.item.slug);
      const targetSlug = matchingChild
        ? matchingChild.slug
        : p.item.children[0].slug;
      p.onNavigate(targetSlug);
    } else {
      p.onNavigate(p.item.slug);
    }
  };

  const handleChevronClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    p.onToggle();
  };

  const paddingLeft = () => {
    if (p.level === 0) return "pl-3";
    if (p.level === 1) return "pl-6";
    if (p.level === 2) return "pl-9";
    return "pl-12";
  };

  return (
    <div>
      <button
        type="button"
        class={`ui-pad-sm flex w-full cursor-pointer items-center justify-between border-l-4 text-left text-sm ${paddingLeft()}`}
        classList={{
          "bg-primary/10": isActive(),
          "text-primary": isActive(),
          "border-primary": isActive(),
          "text-base-content": !isActive(),
          "border-transparent": !isActive(),
          "hover:bg-base-200": !isActive(),
        }}
        onClick={handleLabelClick}
        role="link"
        aria-current={isActive() ? "page" : undefined}
      >
        <span class="flex-1">{p.item.label}</span>
        <Show when={hasChildren()} keyed>
          <button
            type="button"
            class="flex h-[1.25em] w-[1.25em] items-center justify-center"
            onClick={handleChevronClick}
            aria-label={p.isExpanded ? "Collapse" : "Expand"}
            aria-expanded={p.isExpanded}
          >
            <Show when={p.isExpanded} fallback={<ChevronRightIcon />} keyed>
              <ChevronDownIcon />
            </Show>
          </button>
        </Show>
      </button>

      <Show when={hasChildren() && p.isExpanded} keyed>
        <NavItemsGroup
          items={p.item.children!}
          currentSlug={p.currentSlug}
          onNavigate={p.onNavigate}
          level={p.level + 1}
        />
      </Show>
    </div>
  );
}
