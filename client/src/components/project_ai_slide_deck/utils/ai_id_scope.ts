import type { AiIdScope } from "lib";

export function createAiIdScope(deckId: string): AiIdScope {
  return {
    deckId,
    slideMap: new Map(),
    reverseSlideMap: new Map(),
    blockMaps: new Map(),
    reverseBlockMaps: new Map(),
  };
}

export function registerSlide(scope: AiIdScope, slideUuid: string): string {
  const existing = scope.reverseSlideMap.get(slideUuid);
  if (existing) return existing;

  const nextNum = scope.slideMap.size + 1;
  const shortId = `s${nextNum}`;

  scope.slideMap.set(shortId, slideUuid);
  scope.reverseSlideMap.set(slideUuid, shortId);

  return shortId;
}

export function registerBlock(
  scope: AiIdScope,
  slideUuid: string,
  blockUuid: string
): string {
  let blockMap = scope.blockMaps.get(slideUuid);
  let reverseBlockMap = scope.reverseBlockMaps.get(slideUuid);

  if (!blockMap) {
    blockMap = new Map();
    reverseBlockMap = new Map();
    scope.blockMaps.set(slideUuid, blockMap);
    scope.reverseBlockMaps.set(slideUuid, reverseBlockMap!);
  }

  const existing = reverseBlockMap!.get(blockUuid);
  if (existing) return existing;

  const nextNum = blockMap.size + 1;
  const shortId = `b${nextNum}`;

  blockMap.set(shortId, blockUuid);
  reverseBlockMap!.set(blockUuid, shortId);

  return shortId;
}

export function getSlideUuid(scope: AiIdScope, shortId: string): string {
  const uuid = scope.slideMap.get(shortId);
  if (!uuid) throw new Error(`Invalid slide ID: ${shortId}`);
  return uuid;
}

export function getBlockUuid(
  scope: AiIdScope,
  slideUuid: string,
  shortId: string
): string {
  const blockMap = scope.blockMaps.get(slideUuid);
  if (!blockMap) throw new Error(`No blocks registered for slide`);

  const uuid = blockMap.get(shortId);
  if (!uuid) throw new Error(`Invalid block ID: ${shortId}`);
  return uuid;
}
