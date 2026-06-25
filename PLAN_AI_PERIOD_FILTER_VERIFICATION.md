# Add period-filter verification step to AI slide workflows

## Context
When the AI writes statistics into a text block accompanying a figure, it may reference time periods from `get_metric_data` that don't match the figure's actual active period filter. This new workflow step ensures the AI always checks the figure's period filter before writing accompanying text.

## Change
Add step 5 to the Workflow section in both slide-editing system prompts in `client/src/components/project_ai/build_system_prompt.ts`:

**New step text:**
> 5. Before writing any statistics into a text block that accompanies a figure, always call get_slide_editor to read back the figure's active period filter. Ensure the time period referenced in the text matches the period filter actually applied to the figure. Never derive statistics from a get_metric_data query if the figure has a more restrictive period filter applied. When describing data in text, always explicitly state the time period being discussed (e.g. "Between January 2022 and December 2023, ..." or "In Q3 2024, ...") so the reader knows exactly which period the statistics refer to.

### Location 1: `getEditingSlideDeckInstructions` (~line 538)
- Append step 5 after the existing step 4 (`4. Call get_metric_data before creating from_metric blocks...`)

### Location 2: `getEditingSlideInstructions` (~line 571)
- Append step 5 after the existing step 4 (`4. Changes are LOCAL until the user saves...`)

## Verification
- Run `deno task typecheck` to confirm no type errors
- Visually inspect the system prompt via the "View system prompt" option in the AI chat pane while editing a slide/deck
