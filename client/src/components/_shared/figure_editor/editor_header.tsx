import { HeadingBar } from "panther";
import { type JSX, Show } from "solid-js";
import type { VizEditorProductChrome } from "./visualization_editor";

// The figure editor's header, rendered by every stage of opening the editor (a
// product host's own load, the wrapper's load of the metric's shape, the
// editor itself), so the bar is the same throughout and only the editor's own
// controls arrive with it. Each instance builds its own product chrome. A
// loading stage passes `onBack`; the editor passes its own `left` group and
// `controls`, built once: HeadingBar reads its slots more than once.
export function FigureEditorHeader(p: {
  onBack?: () => void;
  left?: JSX.Element;
  label: string;
  productChrome?: VizEditorProductChrome;
  controls?: JSX.Element;
}) {
  const heading = (
    <Show
      when={p.productChrome}
      fallback={<span class="font-400">{p.label}</span>}
    >
      {(chrome) => chrome().title()}
    </Show>
  );
  const right = (
    <div class="ui-gap-sm flex items-center">
      <Show when={p.productChrome}>{(chrome) => chrome().actions()}</Show>
      {p.controls}
    </div>
  );
  return (
    <HeadingBar
      tonal
      data-cursor-zone="header"
      data-tour="viz-editor-header"
      onBack={p.onBack}
      leftChildren={p.left}
      heading={heading}
    >
      {right}
    </HeadingBar>
  );
}
