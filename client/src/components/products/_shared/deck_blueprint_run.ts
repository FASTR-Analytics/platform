import type { DeckBlueprint } from "lib";
import { createSignal } from "solid-js";

// A blueprint being applied to a deck: set when the person starts it from
// the deck (slide_deck/blueprint), read by the copilot's blueprint tools
// (get_blueprint_run, propose_blueprint_outline), which work only on the
// deck it names. One at a time per tab: starting another replaces it.
export type DeckBlueprintRun = {
  deckId: string;
  blueprint: DeckBlueprint;
  // "latest": the AI finds the latest complete period of the blueprint's
  // reporting length in the deck's own data and shows it in the outline.
  period:
    | { mode: "latest" }
    | { mode: "chosen"; start: number; end: number };
  startedAt: string;
};

const [run, setRun] = createSignal<DeckBlueprintRun | undefined>();

export function startDeckBlueprintRun(next: DeckBlueprintRun): void {
  setRun(next);
}

export function deckBlueprintRunFor(
  deckId: string,
): DeckBlueprintRun | undefined {
  const r = run();
  return r?.deckId === deckId ? r : undefined;
}

export function endDeckBlueprintRun(deckId: string): void {
  if (run()?.deckId === deckId) setRun(undefined);
}
