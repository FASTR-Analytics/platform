import { type JSX, Show } from "solid-js";

// App-owned inverted chrome (moved from panther's HeadingBarMainRibbon; the
// kit no longer ships inverted surfaces). The bg-base-content/text-base-100
// pair is what the dark-mode re-invert rule in app.css keys on.
type Props = {
  heading: string | JSX.Element;
  children?: JSX.Element;
  leftChildren?: JSX.Element;
};

export function HeadingBarMainRibbon(p: Props) {
  return (
    <div class="ui-pad ui-gap bg-base-content text-base-100 flex w-full flex-none items-center overflow-hidden">
      <Show when={p.leftChildren} keyed>
        {(keyedLeftChildren) => {
          return <div class="flex-none">{keyedLeftChildren}</div>;
        }}
      </Show>
      <div class="ui-text-heading text-base-100 flex-1 py-1.5">{p.heading}</div>
      <Show when={p.children} keyed>
        {(keyedRightChildren) => {
          return <div class="flex-none">{keyedRightChildren}</div>;
        }}
      </Show>
    </div>
  );
}
