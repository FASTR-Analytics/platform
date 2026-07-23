// "What's New" release-note popups, authored in the Admin-Website and fetched
// by the platform server from status-api. The JSON shape is duplicated in
// Admin-Website/src/frontend/types.ts — keep the two in sync.

// Locked page layouts — the only way a page can be laid out, so every post
// renders with the same visual vocabulary.
export type WhatsNewLayoutPreset =
  | "textOnly"
  | "heroTop"
  | "imageLeft"
  | "imageRight"
  | "imageBottom"
  | "cover";

// Drives both the platform renderer and the Admin-Website preview mock
// (duplicated there — repos share no code; keep in sync).
export const WHATS_NEW_LAYOUTS: Record<
  WhatsNewLayoutPreset,
  { hasImage: boolean; row: boolean; imageFirst: boolean; widthPct: number; cover: boolean }
> = {
  textOnly: { hasImage: false, row: false, imageFirst: false, widthPct: 0, cover: false },
  heroTop: { hasImage: true, row: false, imageFirst: true, widthPct: 100, cover: false },
  imageBottom: { hasImage: true, row: false, imageFirst: false, widthPct: 100, cover: false },
  imageLeft: { hasImage: true, row: true, imageFirst: true, widthPct: 40, cover: false },
  imageRight: { hasImage: true, row: true, imageFirst: false, widthPct: 40, cover: false },
  cover: { hasImage: true, row: false, imageFirst: true, widthPct: 100, cover: true },
};

// Authored text, per language. English is required; fr/pt fall back to
// English when absent — same semantics as the app's t3() translations.
export type WhatsNewText = {
  en: string;
  fr?: string;
  pt?: string;
};

export type WhatsNewPage = {
  title?: WhatsNewText;
  body: WhatsNewText; // markdown
  imageUrl?: string; // absolute URL on status-api; required for image presets
  layoutPreset: WhatsNewLayoutPreset;
};

export type WhatsNewPost = {
  id: string;
  version: string; // platform version this post is tied to, e.g. "1.62.0"
  title: WhatsNewText;
  pages: WhatsNewPage[];
  adminsOnly: boolean;
  published: boolean;
  publishAt?: string; // ISO; the admin feed withholds the post until this time
  createdAt: string;
  updatedAt: string;
};

export type WhatsNewEvent = "seen" | "skipped" | "completed";

// Numeric dotted-version compare ("1.9.0" < "1.10.0"); missing or non-numeric
// parts count as 0 (so "1.61.0-beta" orders as "1.61.0", not NaN).
// Returns <0 if a<b, 0 if equal, >0 if a>b.
export function compareDottedVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.split(".").map((part) => {
      const n = parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
