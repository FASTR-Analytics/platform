// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { CustomMarkdownStyle } from "../_004_markdown_style/mod.ts";
export type {
  CustomMarkdownStyleOptions,
  MergedMarkdownStyle,
} from "../_004_markdown_style/mod.ts";
export { parseEmailsInText, parseMarkdown } from "../_105_markdown/mod.ts";
export type {
  ImageMap,
  MarkdownInline,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "../_105_markdown/mod.ts";
export {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Math as DocxMath,
  MathFraction,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
export type {
  AlignmentType as IAlignmentType,
  INumberingOptions,
  ISectionPropertiesOptions,
  IStylesOptions,
  PageOrientation as IPageOrientation,
  ShadingType as IShadingType,
} from "docx";
export { default as MarkdownIt } from "markdown-it";
