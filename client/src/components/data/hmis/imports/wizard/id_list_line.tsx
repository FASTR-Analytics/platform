import { t3 } from "lib";
import { Button } from "panther";
import { Show, createSignal } from "solid-js";

const SHOWN_BEFORE_FOLD = 10;

type Props = {
  ids: string[];
  // The count and the reason, e.g. "5 Uploaded indicators were left out,
  // because a DHIS2 import cannot fetch them"; the ids follow a colon.
  summary: string;
  class?: string;
};

// One line naming a group of ids under one reason, folded past ten so a
// hundred skipped indicators read as a count with a button, not a wall.
export function IdListLine(p: Props) {
  const [expanded, setExpanded] = createSignal(false);
  const folded = () => !expanded() && p.ids.length > SHOWN_BEFORE_FOLD;
  const shown = () => (folded() ? p.ids.slice(0, SHOWN_BEFORE_FOLD) : p.ids);
  return (
    <Show when={p.ids.length > 0}>
      <div class={p.class}>
        {p.summary}: <span class="font-mono">{shown().join(", ")}</span>
        <Show when={folded()}>
          {" "}
          <Button onClick={() => setExpanded(true)} size="sm" outline>
            {`${t3({ en: "and", fr: "et", pt: "e" })} ${p.ids.length - SHOWN_BEFORE_FOLD} ${t3({ en: "more", fr: "autres", pt: "mais" })}`}
          </Button>
        </Show>
      </div>
    </Show>
  );
}
