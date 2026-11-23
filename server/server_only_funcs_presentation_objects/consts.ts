export const MAX_ITEMS = 20000;
// The Explore grid read's row cap: one value per row, so rows are cells. Its
// payload is dictionary-encoded (lib/grid_items.ts), which is what makes a
// cap this far above MAX_ITEMS affordable.
export const GRID_MAX_CELLS = 500000;
