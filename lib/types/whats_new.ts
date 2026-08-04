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

// Per-page media scale. The preset fixes WHERE media sits and its base width;
// this scales that width down, so pages stay visually consistent while a
// smaller screenshot or clip can be shown at a sensible size.
export type WhatsNewMediaSize = "sm" | "md" | "full";

export const WHATS_NEW_MEDIA_SCALES: Record<WhatsNewMediaSize, number> = {
  sm: 0.5,
  md: 0.75,
  full: 1,
};

// Final rendered width % for a page's media (cover ignores width entirely)
export function whatsNewMediaWidthPct(
  preset: WhatsNewLayoutPreset,
  size: WhatsNewMediaSize | undefined,
): number {
  const layout = WHATS_NEW_LAYOUTS[preset] ?? WHATS_NEW_LAYOUTS.textOnly;
  return layout.widthPct * (WHATS_NEW_MEDIA_SCALES[size ?? "full"] ?? 1);
}

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
  mediaSize?: WhatsNewMediaSize; // default "full"
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

// ─── Bell read-state ────────────────────────────────────────────────────
// Tracked as a set of post ids (not a high-water version) so the unread dot
// persists until EVERY missed post has been opened. Stored in Clerk
// unsafeMetadata, which is client-writable — hence the defensive parsing.

// Returns undefined when nothing valid is stored, which is what distinguishes
// "never tracked, consider migrating" from "tracked, nothing read yet".
export function parseWhatsNewReadIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter((v): v is string => typeof v === "string");
}

// Users predating per-post tracking carry a high-water version string;
// everything at or below it was already acknowledged.
export function migrateSeenVersionToReadIds(
  posts: WhatsNewPost[],
  seenVersion: string,
): string[] {
  return posts
    .filter((p) => compareDottedVersions(p.version, seenVersion) <= 0)
    .map((p) => p.id);
}

// Keeps the stored set bounded: only ids still in the eligible list survive
export function pruneWhatsNewReadIds(
  readIds: Iterable<string>,
  posts: WhatsNewPost[],
): string[] {
  const eligible = new Set(posts.map((p) => p.id));
  return [...new Set(readIds)].filter((id) => eligible.has(id));
}

export function whatsNewUnreadPosts(
  posts: WhatsNewPost[],
  readIds: Set<string>,
): WhatsNewPost[] {
  return posts.filter((p) => !readIds.has(p.id));
}

// The post to push at login: the newest unread release that is ALSO newer
// than every release already acknowledged. Once a version has been seen,
// nothing at or below it auto-opens again — a backlog of older unread posts
// stays reachable from the bell instead of resurfacing one per login.
export function whatsNewAutoShowPost(
  posts: WhatsNewPost[],
  readIds: Set<string>,
): WhatsNewPost | undefined {
  const unread = whatsNewUnreadPosts(posts, readIds);
  if (unread.length === 0) {
    return undefined;
  }
  const highestRead = posts
    .filter((p) => readIds.has(p.id))
    .reduce<string | undefined>(
      (acc, p) =>
        acc === undefined || compareDottedVersions(p.version, acc) > 0
          ? p.version
          : acc,
      undefined,
    );
  const candidates = highestRead === undefined
    ? unread
    : unread.filter((p) => compareDottedVersions(p.version, highestRead) > 0);
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates.reduce((a, b) =>
    compareDottedVersions(a.version, b.version) >= 0 ? a : b
  );
}

// Page media may be an image/GIF or an mp4 clip; both live in imageUrl
export function isWhatsNewVideo(url: string | undefined): boolean {
  return !!url && /\.mp4(\?|$)/i.test(url);
}

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
