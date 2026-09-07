// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Dead-option guard (see _003_figure_style/_4_key_coverage.ts).
import type { AssertNoMissingKeys, MissingKeyPaths } from "./deps.ts";
import type { CustomPageStyleOptions } from "./_2_custom_page_style_options.ts";
import type {
  MergedCoverStyle,
  MergedFreeformStyle,
  MergedPageNumberStyle,
  MergedSectionStyle,
} from "./_3_merged_style_return_types.ts";
import type { PageTextStyleKey } from "./text_style_keys.ts";

type C<K extends keyof CustomPageStyleOptions> = NonNullable<
  CustomPageStyleOptions[K]
>;

export type PageStyleKeyCoverage = {
  cover: AssertNoMissingKeys<MissingKeyPaths<C<"cover">, MergedCoverStyle>>;
  section: AssertNoMissingKeys<
    MissingKeyPaths<C<"section">, MergedSectionStyle>
  >;
  freeform: AssertNoMissingKeys<
    MissingKeyPaths<C<"freeform">, MergedFreeformStyle>
  >;
  pageNumber: AssertNoMissingKeys<
    MissingKeyPaths<C<"pageNumber">, MergedPageNumberStyle>
  >;
  text: AssertNoMissingKeys<
    Exclude<
      PageTextStyleKey,
      | "base"
      | keyof MergedCoverStyle["text"]
      | keyof MergedSectionStyle["text"]
      | keyof MergedFreeformStyle["text"]
    >
  >;
  groups: AssertNoMissingKeys<
    Exclude<keyof CustomPageStyleOptions, keyof PageStyleKeyCoverage | "text">
  >;
};
