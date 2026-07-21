// "What's New" release-note popups, authored in the Admin-Website and fetched
// by the platform server from status-api. The JSON shape is duplicated in
// Admin-Website/src/frontend/types.ts — keep the two in sync.

export type WhatsNewImagePosition = "top" | "bottom" | "left" | "right";

export type WhatsNewPage = {
  title?: string;
  body: string; // markdown
  imageUrl?: string; // absolute URL on status-api
  imagePosition?: WhatsNewImagePosition; // default "top"
};

export type WhatsNewPost = {
  id: string;
  version: string; // platform version this post is tied to, e.g. "1.62.0"
  title: string;
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
