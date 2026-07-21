import { customAlphabet } from "nanoid";
import type { ContentBlock } from "lib";
import type { IdGenerator, LayoutNode } from "panther";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";

// Per-client (per-tab) prefix, minted once at module load. Block ids are only
// required to be unique within a single slide's layout, but under realtime
// co-editing two clients can mint a new block at the same instant before either
// has seen the other's op. The shared prefix guarantees their ids differ even
// when their suffixes happen to collide. 31^6 ≈ 8.9e8 keeps prefix collision
// between concurrent editors negligible. The within-layout check below still
// guards the (now astronomically unlikely) same-client suffix repeat.
const generatePrefix = customAlphabet(alphabet, 6);
const CLIENT_PREFIX = generatePrefix();

const generateSuffix = customAlphabet(alphabet, 4);

function generateId(): string {
  return `${CLIENT_PREFIX}${generateSuffix()}`;
}

function getAllIdsInLayout(layout: LayoutNode<ContentBlock>): Set<string> {
  const ids = new Set<string>();
  function traverse(node: LayoutNode<ContentBlock>) {
    ids.add(node.id);
    if (node.type !== "item") {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  traverse(layout);
  return ids;
}

export function generateUniqueBlockId(existingLayout?: LayoutNode<ContentBlock>): string {
  const existingIds = existingLayout ? getAllIdsInLayout(existingLayout) : new Set();

  const maxAttempts = 20;
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateId();
    if (!existingIds.has(id)) return id;
  }
  throw new Error("Failed to generate unique block ID after 20 attempts");
}

export function createIdGeneratorForLayout(existingLayout?: LayoutNode<ContentBlock>): IdGenerator {
  const existingIds = existingLayout ? getAllIdsInLayout(existingLayout) : new Set<string>();
  const generatedIds = new Set<string>();

  return () => {
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      const id = generateId();
      if (!existingIds.has(id) && !generatedIds.has(id)) {
        generatedIds.add(id);
        return id;
      }
    }
    throw new Error("Failed to generate unique block ID after 20 attempts");
  };
}
