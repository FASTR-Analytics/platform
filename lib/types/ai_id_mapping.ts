export type AiIdScope = {
  deckId: string;
  slideMap: Map<string, string>; // "s1" -> slide-uuid
  reverseSlideMap: Map<string, string>; // slide-uuid -> "s1"
  blockMaps: Map<string, Map<string, string>>; // slide-uuid -> {"b1" -> block-uuid}
  reverseBlockMaps: Map<string, Map<string, string>>; // slide-uuid -> {block-uuid -> "b1"}
};
