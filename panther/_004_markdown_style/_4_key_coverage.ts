// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Dead-option guard (see _003_figure_style/_4_key_coverage.ts). Markdown
// authors em metrics (`*Em`) that the merge projects to px under flat names,
// so the merged type is viewed through the authoring shape below; every
// landing is an indexed access into MergedMarkdownStyle so a renamed or
// removed merged field fails here too.
import type { AssertNoMissingKeys, MissingKeyPaths } from "./deps.ts";
import type { CustomMarkdownStyleOptions } from "./_2_custom_markdown_style_options.ts";
import type {
  MergedListLevel,
  MergedMarkdownStyle,
} from "./_3_merged_style_return_types.ts";
import type { MarkdownTextStyleKey } from "./text_style_keys.ts";

type ListLevelLanding = {
  marker: MergedListLevel["marker"];
  markerIndentEm: MergedListLevel["markerIndent"];
  textIndentEm: MergedListLevel["textIndent"];
};

type MergedAuthoringView = {
  alignH: MergedMarkdownStyle["alignH"];
  marginsEm: MergedMarkdownStyle["margins"];
  bulletList: {
    level0: ListLevelLanding;
    level1: ListLevelLanding;
    level2: ListLevelLanding;
  };
  numberedList: {
    level0: ListLevelLanding;
    level1: ListLevelLanding;
    level2: ListLevelLanding;
  };
  blockquote: {
    leftBorderWidth: MergedMarkdownStyle["blockquote"]["leftBorderWidth"];
    leftBorderColor: MergedMarkdownStyle["blockquote"]["leftBorderColor"];
    paddingEm: {
      top: MergedMarkdownStyle["blockquote"]["paddingTop"];
      bottom: MergedMarkdownStyle["blockquote"]["paddingBottom"];
      left: MergedMarkdownStyle["blockquote"]["paddingLeft"];
      right: MergedMarkdownStyle["blockquote"]["paddingRight"];
    };
    paragraphGapEm: MergedMarkdownStyle["blockquote"]["paragraphGap"];
    alignH: MergedMarkdownStyle["blockquote"]["alignH"];
    backgroundColor: MergedMarkdownStyle["blockquote"]["backgroundColor"];
  };
  code: {
    backgroundColor: MergedMarkdownStyle["code"]["backgroundColor"];
    paddingEm: {
      horizontal: MergedMarkdownStyle["code"]["paddingHorizontal"];
      vertical: MergedMarkdownStyle["code"]["paddingVertical"];
    };
  };
  horizontalRule: MergedMarkdownStyle["horizontalRule"];
  link: MergedMarkdownStyle["link"];
  image: MergedMarkdownStyle["image"];
  table: {
    border: {
      width: MergedMarkdownStyle["table"]["borderWidth"];
      color: MergedMarkdownStyle["table"]["borderColor"];
      style: MergedMarkdownStyle["table"]["borderStyle"];
    };
    cellPaddingEm: {
      horizontal: MergedMarkdownStyle["table"]["cellPaddingHorizontal"];
      vertical: MergedMarkdownStyle["table"]["cellPaddingVertical"];
    };
    headerShading: {
      color: MergedMarkdownStyle["table"]["headerShadingColor"];
      opacity: MergedMarkdownStyle["table"]["headerShadingOpacity"];
    };
  };
};

export type MarkdownStyleKeyCoverage = {
  options: AssertNoMissingKeys<
    MissingKeyPaths<
      Omit<CustomMarkdownStyleOptions, "text">,
      MergedAuthoringView
    >
  >;
  text: AssertNoMissingKeys<
    Exclude<MarkdownTextStyleKey, "base" | keyof MergedMarkdownStyle["text"]>
  >;
};
