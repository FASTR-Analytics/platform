import { createEffect, createMemo, type JSX, Match, Switch } from "solid-js";
import { ChartHolder, type FigureInputs } from "panther";
import { type FigureBlock, t3 } from "lib";
import {
  figureSourceToHydrationSource,
  hydrateFigureInputsForRendering,
} from "~/generate_visualization/mod";

type Props = {
  figure: FigureBlock;
  onMeasured?: () => void;
};

type Hydrated =
  | { ok: true; inputs: FigureInputs }
  | { ok: false; err: string };

// One reusable FigureBlock -> live ChartHolder embed (editor widget and the
// View-mode preview renderImage both use this). reflow + height="ideal" per
// PROTOCOL_ALL_SIZING (editor is a readable surface). Hydration is a pure sync
// transform, so we derive it in a createMemo — NOT a createResource, which would
// add a Suspense boundary that re-suspends (blanking the embed) on every figure
// change (PROTOCOL_UI_SOLIDJS.md §4). Recomputes when the figure block changes.
export function ReportFigureEmbed(p: Props): JSX.Element {
  const hydrated = createMemo<Hydrated>(() => {
    const fi = p.figure.figureInputs;
    if (!fi) {
      return {
        ok: false,
        err: t3({
          en: "Visualization has no stored inputs",
          fr: "La visualisation n'a pas de données enregistrées",
        }),
      };
    }
    const source = p.figure.source
      ? figureSourceToHydrationSource(p.figure.source)
      : undefined;
    return { ok: true, inputs: hydrateFigureInputsForRendering(fi, source) };
  });

  // Narrowed accessors (no casts): each returns its payload or undefined.
  const inputs = () => {
    const h = hydrated();
    return h.ok ? h.inputs : undefined;
  };
  const errMsg = () => {
    const h = hydrated();
    return h.ok ? undefined : h.err;
  };

  createEffect(() => {
    if (hydrated().ok) p.onMeasured?.();
  });

  return (
    <Switch>
      <Match when={inputs()}>
        {(fi) => (
          <ChartHolder chartInputs={fi()} height="ideal" sizing="zoom" />
        )}
      </Match>
      <Match when={errMsg()}>
        {(msg) => <div class="ui-pad text-danger text-xs">{msg()}</div>}
      </Match>
    </Switch>
  );
}
