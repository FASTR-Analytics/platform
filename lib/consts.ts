import type { AnthropicModel } from "@timroberton/panther";

export const COUNTRY_ISO3_TO_LABEL: Record<string, string> = {
  AFG: "Afghanistan",
  ALB: "Albania",
  DZA: "Algeria",
  AGO: "Angola",
  ARG: "Argentina",
  ARM: "Armenia",
  AZE: "Azerbaijan",
  BGD: "Bangladesh",
  BLR: "Belarus",
  BEN: "Benin",
  BTN: "Bhutan",
  BOL: "Bolivia",
  BIH: "Bosnia and Herzegovina",
  BWA: "Botswana",
  BRA: "Brazil",
  BFA: "Burkina Faso",
  BDI: "Burundi",
  KHM: "Cambodia",
  CMR: "Cameroon",
  CPV: "Cabo Verde",
  CAF: "Central African Republic",
  TCD: "Chad",
  CHL: "Chile",
  CHN: "China",
  COL: "Colombia",
  COM: "Comoros",
  COG: "Congo",
  COD: "Democratic Republic of the Congo",
  CRI: "Costa Rica",
  CIV: "Cote d'Ivoire",
  HRV: "Croatia",
  CUB: "Cuba",
  DJI: "Djibouti",
  DOM: "Dominican Republic",
  ECU: "Ecuador",
  EGY: "Egypt",
  SLV: "El Salvador",
  GNQ: "Equatorial Guinea",
  ERI: "Eritrea",
  SWZ: "Eswatini",
  ETH: "Ethiopia",
  FJI: "Fiji",
  GAB: "Gabon",
  GMB: "Gambia",
  GEO: "Georgia",
  GHA: "Ghana",
  GTM: "Guatemala",
  GIN: "Guinea",
  GNB: "Guinea-Bissau",
  GUY: "Guyana",
  HTI: "Haiti",
  HND: "Honduras",
  IND: "India",
  IDN: "Indonesia",
  IRN: "Iran",
  IRQ: "Iraq",
  JAM: "Jamaica",
  JOR: "Jordan",
  KAZ: "Kazakhstan",
  KEN: "Kenya",
  KIR: "Kiribati",
  PRK: "North Korea",
  XKX: "Kosovo",
  KGZ: "Kyrgyz Republic",
  LAO: "Lao PDR",
  LBN: "Lebanon",
  LSO: "Lesotho",
  LBR: "Liberia",
  LBY: "Libya",
  MDG: "Madagascar",
  MWI: "Malawi",
  MYS: "Malaysia",
  MDV: "Maldives",
  MLI: "Mali",
  MHL: "Marshall Islands",
  MRT: "Mauritania",
  MUS: "Mauritius",
  MEX: "Mexico",
  FSM: "Micronesia",
  MDA: "Moldova",
  MNG: "Mongolia",
  MNE: "Montenegro",
  MAR: "Morocco",
  MOZ: "Mozambique",
  MMR: "Myanmar",
  NAM: "Namibia",
  NRU: "Nauru",
  NPL: "Nepal",
  NIC: "Nicaragua",
  NER: "Niger",
  NGA: "Nigeria",
  MKD: "North Macedonia",
  PAK: "Pakistan",
  PLW: "Palau",
  PSE: "Palestine",
  PAN: "Panama",
  PNG: "Papua New Guinea",
  PRY: "Paraguay",
  PER: "Peru",
  PHL: "Philippines",
  RWA: "Rwanda",
  WSM: "Samoa",
  STP: "Sao Tome and Principe",
  SEN: "Senegal",
  SRB: "Serbia",
  SYC: "Seychelles",
  SLE: "Sierra Leone",
  SLB: "Solomon Islands",
  SOM: "Somalia",
  ZAF: "South Africa",
  SSD: "South Sudan",
  LKA: "Sri Lanka",
  SDN: "Sudan",
  SUR: "Suriname",
  SYR: "Syria",
  TJK: "Tajikistan",
  TZA: "Tanzania",
  THA: "Thailand",
  TLS: "Timor-Leste",
  TGO: "Togo",
  TON: "Tonga",
  TUN: "Tunisia",
  TUR: "Turkiye",
  TKM: "Turkmenistan",
  TUV: "Tuvalu",
  UGA: "Uganda",
  UKR: "Ukraine",
  URY: "Uruguay",
  UZB: "Uzbekistan",
  VUT: "Vanuatu",
  VEN: "Venezuela",
  VNM: "Vietnam",
  YEM: "Yemen",
  ZMB: "Zambia",
  ZWE: "Zimbabwe",
};

export function getCountryLabel(iso3: string): string {
  return COUNTRY_ISO3_TO_LABEL[iso3] ?? iso3;
}

export const _DATASET_LIMIT = 100;

export const _IMAGE_DIMENSIONS = {
  sm: { w: 432, h: 243 },
  md: { w: 720, h: 405 },
};

export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = "claude-sonnet-4-6";

// Maximum content blocks per slide/whiteboard - panther optimizer limit is 4,
// but we use 3 for better layouts
export const MAX_CONTENT_BLOCKS = 3;

// Slide text length guidelines for AI-generated content
export const SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET = "50-100";
export const SLIDE_TEXT_TOTAL_WORD_COUNT_MAX = 180;

// Output pixel width for downloading a single figure as a PNG. The figure is
// laid out at the canonical REFERENCE_WIDTH_DU frame and supersampled to this.
export const FIGURE_EXPORT_WIDTH_PX = 1920;

// The deck's zoom-frame geometry, in DUs. PAGE_WIDTH_DU is wider than the
// default REFERENCE_WIDTH_DU (1000) for a roomier page without retuning styles.
// One source of truth: every slide/page surface (PageHolder on screen, AI layout
// optimization, and all deck exports) reads these — never recompute the aspect
// inline. Screen and export stay in lockstep because they read the same values.
export const PAGE_ASPECT = 9 / 16;
export const PAGE_WIDTH_DU = 1300;
export const PAGE_HEIGHT_DU = Math.round(PAGE_WIDTH_DU * PAGE_ASPECT);
