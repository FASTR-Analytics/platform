import { For } from "solid-js";

// A break opportunity after each underscore, so a long id wraps there only
// when it does not fit; <wbr> adds nothing to copied text.
export function WrapOnUnderscore(p: { text: string }) {
  return (
    <For each={p.text.split(/(?<=_)/)}>
      {(part) => (
        <>
          {part}
          <wbr />
        </>
      )}
    </For>
  );
}
