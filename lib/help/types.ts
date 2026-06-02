import type { TranslatableString } from "../translate/types.ts";

export type HelpTarget = {
  page: string;
  anchor: TranslatableString;
  title: TranslatableString;
  summary: TranslatableString;
};
