export const _DATASET_LIMIT = 100;

export const _IMAGE_DIMENSIONS = {
  sm: { w: 432, h: 243 },
  md: { w: 720, h: 405 },
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

// Maximum content blocks per slide/whiteboard - panther optimizer limit is 4,
// but we use 3 for better layouts
export const MAX_CONTENT_BLOCKS = 3;
