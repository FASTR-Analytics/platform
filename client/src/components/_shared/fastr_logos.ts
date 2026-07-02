import { _SERVER_HOST } from "~/server_actions";

// Built-in FASTR logos bundled with the app (served from the app root) plus the
// URL resolver shared by every logo surface (slide decks, dashboards).
export const FASTR_LOGOS = [
  {
    value: "images/FASTR_Primary_01_Horiz.png",
    label: { en: "FASTR (colored)", fr: "FASTR (couleur)", pt: "FASTR (a cores)" },
  },
  {
    value: "images/FASTR_White_Horiz.png",
    label: { en: "FASTR (white)", fr: "FASTR (blanc)", pt: "FASTR (branco)" },
  },
];

export const FASTR_LOGO_VALUES = FASTR_LOGOS.map((l) => l.value);

// Built-in FASTR logos are served from the app root; uploaded image assets from
// the server host.
export function resolveLogoUrl(logo: string): string {
  return FASTR_LOGO_VALUES.includes(logo)
    ? `/${logo}`
    : `${_SERVER_HOST}/${logo}`;
}
