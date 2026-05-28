import type { FigureInputs } from "@timroberton/panther";
import type { FigureBlock, FigureSource } from "./slides.ts";
import type { IndicatorMetadata } from "./indicators.ts";
import type { PresentationObjectConfig } from "./presentation_objects.ts";

// Re-export schemas from underscore-prefixed file (stored data validation)
export {
  dashboardFigureBlockSchema,
  dashboardLayoutSchema,
} from "./_dashboard_config.ts";

// Re-export for convenience
export type { FigureBlock, FigureSource };

// ── Dashboard core types ────────────────────────────────────────────────────

export type DashboardLayout =
  | { type: "sidebar" }
  | { type: "grid" };

export type DashboardItem = {
  id: string;
  dashboardId: string;
  label: string;
  sortOrder: number;
  figureBlock: FigureBlock;
  geoData?: unknown;
  lastUpdated: string;
};

export type Dashboard = {
  id: string;
  slug: string;
  title: string;
  isPublic: boolean;
  layout: DashboardLayout;
  items: DashboardItem[];
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
  items: PublicDashboardItem[];
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
};

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
