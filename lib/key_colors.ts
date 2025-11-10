export const _PRIMARY_GFF = "#0E706C";

export const _KEY_COLORS = {
  base100: "white",
  base200: "#F2F2F2",
  base300: "#CACACA",
  baseContent: "#2A2A2A",
  baseContentLessVisible: "rgb(12, 23, 33)",
  primary: _PRIMARY_GFF,
  primaryContent: "white",
};

export const _SLIDE_BACKGROUND_COLOR = "#027D53";

export const _KEY_COLORS_SUCCESS = "#009F70";
export const _KEY_COLORS_DANGER = "#F04D44";

export const _CF_COMPARISON = "#7A7A7A";

export const _RANDOM_BLUE = "#2749ae";

export const _CF_GREEN = "#27AE60";
export const _CF_YELLOW = "#F2C94C";
export const _CF_RED = "#EB5757";

export const _CF_LIGHTER_GREEN = "#68C690";
export const _CF_LIGHTER_YELLOW = "#F6D982";
export const _CF_LIGHTER_RED = "#F18989";

export const _COLOR_WATERMARK_WHITE = "rgba(255,255,255, 0.25)";
export const _COLOR_WATERMARK_GREY = "rgba(150,150,150, 0.4)";

export const _QUAL_SCALE = [
  _CF_GREEN,
  "#8A5A9B",
  "#ECD950",
  "#74CEDF",
  "#F98C45",
  "#F58EAA",
  "#F04D44",
];

export const _QUAL_SCALE_2 = [
  "#e53935",
  "#d81b60",
  "#8e24aa",
  "#5e35b1",
  "#3949ab",
  "#1e88e5",
  "#039be5",
  "#00acc1",
  "#00897b",
  "#43a047",
  "#7cb342",
  "#c0ca33",
  "#fdd835",
  "#ffb300",
  "#fb8c00",
  "#f4511e",
  "#6d4c41",
  "#757575",
  "#546e7A",
];

export function getAbcQualScale(i: number): string {
  const n = _QUAL_SCALE.length;
  const _i = i % n;
  return _QUAL_SCALE.at(_i) ?? "purple";
}

export function getAbcQualScale2(i: number): string {
  const n = _QUAL_SCALE_2.length;
  const _i = i % n;
  return _QUAL_SCALE_2.at(_i) ?? "purple";
}
