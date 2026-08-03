import {
  canonicalJson,
  type ContentBlock,
  type Slide,
  TEXT_FIELDS_BY_TYPE,
} from "lib";

// What changed INSIDE a slide between two versions, element by element. Keys
// align with the server observer's element keys (observeSlideDocElements in
// lib/collab/slide_crdt.ts) so each change can be attributed to whoever
// touched that element during the session:
//   "field:<name>"  root text field   "block:<id>"  layout block
//   "layout"        arrangement only  "props"       other slide settings
// Pure module — harness-testable.

export type SlideElementChange = {
  key: string;
  kind: "edited" | "added" | "removed";
  blockType?: ContentBlock["type"];
  field?: string;
  /** Text before/after for text fields and text blocks (drives a mini diff). */
  oldText?: string;
  newText?: string;
  /** Block snapshots for figure/image blocks (drive a before/after preview). */
  oldBlock?: ContentBlock;
  newBlock?: ContentBlock;
};

type ItemNode = {
  id: string;
  type: "item";
  data: ContentBlock;
};

type AnyNode = {
  id: string;
  type: string;
  data?: ContentBlock;
  children?: AnyNode[];
};

function collectItems(slide: Slide): Map<string, ItemNode> {
  const map = new Map<string, ItemNode>();
  const walk = (node: AnyNode | undefined): void => {
    if (!node) {
      return;
    }
    if (node.type === "item" && node.data) {
      map.set(node.id, node as ItemNode);
    } else {
      for (const child of node.children ?? []) {
        walk(child);
      }
    }
  };
  if (slide.type === "content") {
    walk(slide.layout as unknown as AnyNode);
  }
  return map;
}

function textOf(block: ContentBlock): string {
  return block.type === "text" ? (block.markdown ?? "") : "";
}

/** Structural signature of a layout tree over the SURVIVING blocks: nesting,
 *  node identity/type, and CONTAINER geometry. Item content and item geometry
 *  are already compared per block ("block:<id>"), and added/removed blocks are
 *  already reported as such, so both stay out of this — it answers only "was
 *  the arrangement changed", with no double-reporting. */
function layoutShape(layout: unknown, sharedItemIds: Set<string>): string {
  const walk = (node: AnyNode | undefined): unknown => {
    if (!node) {
      return null;
    }
    if (node.type === "item") {
      return sharedItemIds.has(node.id) ? { id: node.id, type: node.type } : null;
    }
    const g = node as unknown as Record<string, unknown>;
    return {
      id: node.id,
      type: node.type,
      span: g.span ?? null,
      minH: g.minH ?? null,
      maxH: g.maxH ?? null,
      children: (node.children ?? []).map(walk).filter((c) => c !== null),
    };
  };
  return canonicalJson(walk(layout as AnyNode | undefined));
}

export function diffSlideElements(
  oldSlide: Slide,
  newSlide: Slide,
): SlideElementChange[] {
  const changes: SlideElementChange[] = [];
  if (oldSlide.type !== newSlide.type) {
    // A wholesale type swap — element-by-element comparison is meaningless.
    return [{ key: "props", kind: "edited" }];
  }

  const o = oldSlide as unknown as Record<string, unknown>;
  const n = newSlide as unknown as Record<string, unknown>;

  for (const f of TEXT_FIELDS_BY_TYPE[newSlide.type]) {
    const ov = typeof o[f] === "string" ? (o[f] as string) : "";
    const nv = typeof n[f] === "string" ? (n[f] as string) : "";
    if (ov !== nv) {
      changes.push({
        key: `field:${f}`,
        kind: "edited",
        field: f,
        oldText: ov,
        newText: nv,
      });
    }
  }

  if (newSlide.type === "content") {
    for (const k of ["showHeaderLogos", "showFooterLogos", "split"]) {
      if (canonicalJson(o[k] ?? null) !== canonicalJson(n[k] ?? null)) {
        changes.push({ key: "props", kind: "edited" });
        break;
      }
    }

    const oldItems = collectItems(oldSlide);
    const newItems = collectItems(newSlide);
    for (const [id, item] of newItems) {
      const old = oldItems.get(id);
      if (!old) {
        changes.push({
          key: `block:${id}`,
          kind: "added",
          blockType: item.data.type,
          ...(item.data.type === "text"
            ? { newText: textOf(item.data) }
            : { newBlock: item.data }),
        });
      } else if (canonicalJson(old) !== canonicalJson(item)) {
        const bothText = item.data.type === "text" && old.data.type === "text";
        changes.push({
          key: `block:${id}`,
          kind: "edited",
          blockType: item.data.type,
          ...(bothText
            ? { oldText: textOf(old.data), newText: textOf(item.data) }
            : { oldBlock: old.data, newBlock: item.data }),
        });
      }
    }
    for (const [id, item] of oldItems) {
      if (!newItems.has(id)) {
        changes.push({
          key: `block:${id}`,
          kind: "removed",
          blockType: item.data.type,
          ...(item.data.type === "text"
            ? { oldText: textOf(item.data) }
            : { oldBlock: item.data }),
        });
      }
    }

    // Arrangement: the layout TREE, not just surviving-item document order —
    // unwrapping a container, wrapping blocks into columns, or resizing a
    // container all change the arrangement while leaving item order intact, and
    // an order-only check reports NOTHING for them (the slide still badges
    // "edited" from the whole-config compare, so the panel showed a changed
    // slide with an empty change list).
    const shared = new Set(
      [...newItems.keys()].filter((id) => oldItems.has(id)),
    );
    if (layoutShape(o.layout, shared) !== layoutShape(n.layout, shared)) {
      changes.push({ key: "layout", kind: "edited" });
    }
  } else {
    // cover / section: any non-text scalar difference is a settings change.
    const textSet = new Set<string>(TEXT_FIELDS_BY_TYPE[newSlide.type]);
    const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
    for (const k of keys) {
      if (k === "type" || textSet.has(k)) {
        continue;
      }
      if (canonicalJson(o[k] ?? null) !== canonicalJson(n[k] ?? null)) {
        changes.push({ key: "props", kind: "edited" });
        break;
      }
    }
  }

  return changes;
}
