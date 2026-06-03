import type { FigureInputs } from "@timroberton/panther";
import type { FigureBlock, FigureSource } from "./slides.ts";
import type { IndicatorMetadata } from "./indicators.ts";
import type { PresentationObjectConfig } from "./presentation_objects.ts";
import { formatReplicantLabelForDisplay } from "../format_nigeria_admin_label.ts";

// Re-export schemas from underscore-prefixed file (stored data validation)
export {
  dashboardConfigSchema,
  dashboardFigureBlockSchema,
  dashboardLayoutSchema,
} from "./_dashboard_config.ts";
import type { DashboardConfigFromSchema } from "./_dashboard_config.ts";

// Re-export for convenience
export type { FigureBlock, FigureSource };

// ── Dashboard core types ────────────────────────────────────────────────────

export type DashboardLayout =
  | { type: "sidebar" }
  | { type: "grid" };

export type DashboardConfig = DashboardConfigFromSchema;

export function getStartingDashboardConfig(): DashboardConfig {
  return {
    logos: { availableCustom: [], selected: [] },
    about: { summary: "", body: "" },
  };
}

export type DashboardItem = {
  id: string;
  dashboardId: string;
  label: string;
  sortOrder: number;
  figureBlock: FigureBlock;
  geoData?: unknown;
  lastUpdated: string;
  // Set when this item is a member of a replicant group (see
  // PLAN_DASHBOARD_REPLICANT_GROUPS.md). Group members store geoData on the
  // group, not the row.
  replicantGroupId?: string;
  replicantValue?: string;
};

// A replicated visualization added as one group: N member items + this row,
// which owns the group's label, dimension, default replicant, and the shared
// geojson (one copy for all members).
export type DashboardItemGroup = {
  id: string;
  dashboardId: string;
  label: string;
  replicateBy: string;
  defaultReplicantValue?: string;
  replicants: { value: string; label: string }[];
  geoData?: unknown;
  lastUpdated: string;
};

export type Dashboard = {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  layout: DashboardLayout;
  config: DashboardConfig;
  items: DashboardItem[];
  groups: DashboardItemGroup[];
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getStartingLayoutForDashboard(): DashboardLayout {
  return { type: "sidebar" };
}

// ── API DTOs ────────────────────────────────────────────────────────────────

export type DashboardCreate = {
  slug: string;
  title: string;
  layout?: DashboardLayout;
};

export type DashboardUpdate = {
  slug?: string;
  title?: string;
  isPublic?: boolean;
  layout?: DashboardLayout;
  config?: DashboardConfig;
};

export type DashboardSummary = {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DashboardDetail = Dashboard;

// ── Public viewer types (no auth) ───────────────────────────────────────────

export type PublicDashboardBundle = {
  title: string;
  layout: DashboardLayout;
  // Branding logos (identifiers resolved to URLs client-side) + placement.
  logos: {
    selected: string[];
    placement?: "left" | "right";
  };
  // Markdown: inline summary (under heading) + long body (About modal).
  about: { summary: string; body: string };
  // Flat list of every renderable item (group members + standalones), in order.
  items: PublicDashboardItem[];
  // Grouped view: a standalone item or a replicant group with its members.
  entries: PublicDashboardEntry[];
};

export type PublicDashboardItem = {
  id: string;
  label: string;
  sortOrder: number;
  strippedFigureInputs: FigureInputs;
  source: {
    config: PresentationObjectConfig;
    metricId: string;
    formatAs: "percent" | "number";
    indicatorMetadata?: IndicatorMetadata[];
  };
  geoData?: unknown;
  // Set for group members — the replicant this item represents.
  replicantValue?: string;
};

export type PublicDashboardEntryGroup = {
  id: string;
  label: string;
  replicateBy: string;
  defaultReplicantValue?: string;
  replicants: { value: string; label: string }[];
};

export type PublicDashboardEntry =
  | { kind: "item"; item: PublicDashboardItem }
  | { kind: "group"; group: PublicDashboardEntryGroup; members: PublicDashboardItem[] };

// Canonical Dashboard → PublicDashboardBundle transform. Shared by the client
// editor preview and the server public route so they can never diverge. Group
// members carry the group's shared geojson (members store geo_data = NULL).
export function buildPublicDashboardBundle(
  dashboard: Dashboard,
  countryIso3?: string,
): PublicDashboardBundle {
  function toPublicItem(
    item: DashboardItem,
    geoData: unknown,
  ): PublicDashboardItem | undefined {
    const source = item.figureBlock.source;
    const fi = item.figureBlock.figureInputs;
    if (!fi || !source || source.type !== "from_data") return undefined;
    return {
      id: item.id,
      label: item.label,
      sortOrder: item.sortOrder,
      strippedFigureInputs: fi,
      source: {
        config: source.config,
        metricId: source.metricId,
        formatAs: "number" as const,
        indicatorMetadata: source.indicatorMetadata,
      },
      geoData,
      replicantValue: item.replicantValue,
    };
  }

  const groupsById = new Map(dashboard.groups.map((g) => [g.id, g]));
  const sorted = [...dashboard.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const items: PublicDashboardItem[] = [];
  const entries: PublicDashboardEntry[] = [];
  const groupEntryIndex = new Map<string, number>();

  for (const item of sorted) {
    const gid = item.replicantGroupId;
    const group = gid ? groupsById.get(gid) : undefined;
    if (group) {
      const pub = toPublicItem(item, group.geoData);
      if (!pub) continue;
      items.push(pub);
      const existing = groupEntryIndex.get(group.id);
      if (existing !== undefined) {
        (entries[existing] as { members: PublicDashboardItem[] }).members.push(
          pub,
        );
      } else {
        groupEntryIndex.set(group.id, entries.length);
        entries.push({
          kind: "group",
          group: {
            id: group.id,
            label: group.label,
            replicateBy: group.replicateBy,
            defaultReplicantValue: group.defaultReplicantValue,
            // Display-only: clean Nigeria admin-area labels on the way out;
            // stored replicants[].value/label stay raw.
            replicants: group.replicants.map((r) => ({
              value: r.value,
              label: formatReplicantLabelForDisplay(
                r.label,
                group.replicateBy,
                countryIso3,
              ),
            })),
          },
          members: [pub],
        });
      }
    } else {
      const pub = toPublicItem(item, item.geoData);
      if (!pub) continue;
      items.push(pub);
      entries.push({ kind: "item", item: pub });
    }
  }

  // Defensive `??`: a browser holding a pre-config-feature cached DashboardDetail
  // will lack `config`, and the version-keyed detail cache won't refetch unchanged
  // dashboards after deploy (the no-op data transform doesn't bump last_updated).
  const cfg = dashboard.config ?? getStartingDashboardConfig();

  return {
    title: dashboard.title,
    layout: dashboard.layout,
    logos: {
      selected: cfg.logos.selected,
      placement: cfg.logos.placement,
    },
    about: cfg.about,
    items,
    entries,
  };
}

// ── Slug validation ─────────────────────────────────────────────────────────

export const DASHBOARD_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DASHBOARD_SLUG_MIN_LENGTH = 3;
export const DASHBOARD_SLUG_MAX_LENGTH = 60;

export function isValidDashboardSlug(slug: string): boolean {
  return (
    slug.length >= DASHBOARD_SLUG_MIN_LENGTH &&
    slug.length <= DASHBOARD_SLUG_MAX_LENGTH &&
    DASHBOARD_SLUG_REGEX.test(slug)
  );
}
