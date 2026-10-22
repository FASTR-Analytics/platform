// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "../deps.ts";

export const askUserQuestionsOptionSchema = z.object({
  label: z.string().describe("Short display text for this option"),
  description: z.string().optional().describe(
    "Optional explanation of what this option means",
  ),
});

export type AskUserQuestionsOption = z.infer<
  typeof askUserQuestionsOptionSchema
>;

export const askUserQuestionsInputSchema = z.object({
  question: z.string().describe("The question text to display to the user"),
  options: z.array(askUserQuestionsOptionSchema).min(2).max(6).describe(
    "Available choices (2-6 options)",
  ),
  allowMultiple: z.boolean().optional().describe(
    "If true, user can select multiple options. Defaults to single-select.",
  ),
});

export type AskUserQuestionsInput = z.infer<
  typeof askUserQuestionsInputSchema
>;

export type AskUserQuestionsAnswer = string | string[];

// Marks an answer the user typed instead of picking one of the options, so the
// model reads it as the user's own words rather than as an option label.
export const OWN_ANSWER_PREFIX =
  "The user's own answer (not one of your options): ";
