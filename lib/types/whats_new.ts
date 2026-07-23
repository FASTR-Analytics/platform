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
  | "imageBottom";

// Drives both the platform renderer and the Admin-Website preview mock
// (duplicated there — repos share no code; keep in sync).
export const WHATS_NEW_LAYOUTS: Record<
  WhatsNewLayoutPreset,
  { hasImage: boolean; row: boolean; imageFirst: boolean; widthPct: number }
> = {
  textOnly: { hasImage: false, row: false, imageFirst: false, widthPct: 0 },
  heroTop: { hasImage: true, row: false, imageFirst: true, widthPct: 100 },
  imageBottom: { hasImage: true, row: false, imageFirst: false, widthPct: 100 },
  imageLeft: { hasImage: true, row: true, imageFirst: true, widthPct: 40 },
  imageRight: { hasImage: true, row: true, imageFirst: false, widthPct: 40 },
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
  createdAt: string;
  updatedAt: string;
};

// Numeric dotted-version compare ("1.9.0" < "1.10.0"); missing parts count as 0.
// Returns <0 if a<b, 0 if equal, >0 if a>b.
export function compareDottedVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
