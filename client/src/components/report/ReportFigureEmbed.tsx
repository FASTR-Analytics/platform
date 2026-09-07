import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Match,
  onMount,
  Switch,
} from "solid-js";
import { FigureHolder, type FigureInputs } from "panther";
import { type FastrChartPalette, type FigureBlock, t3 } from "lib";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { applyInkTheme, type FigureInkTheme } from "./report_figure_raster";

type Props = {
  figure: FigureBlock;
  onMeasured?: () => void;
  // The ink for the ground this embed sits on, measured from its own
  // element — dark on light, light on dark — so a figure keeps its stored
  // series colours but never its dashboard's text colour.
  inkFor?: (el: Element) => FigureInkTheme | undefined;
  // The report theme's chart palette (see getStandardSeriesColorFunc).
  chartPalette?: () => FastrChartPalette | undefined;
};

type Hydrated = { ok: true; inputs: FigureInputs } | { ok: false; err: string };

export function ReportFigureEmbed(p: Props): JSX.Element {
  const hydrated = createMemo<Hydrated>(() => {
    const bundle = p.figure.bundle;
    if (!bundle) {
      return {
        ok: false,
        err: t3({
          en: "Visualization has no stored inputs",
          fr: "La visualisation n'a pas de données enregistrées",
          pt: "A visualização não tem dados guardados",
        }),
      };
    }
    try {
      return { ok: true, inputs: buildFigureInputs(bundle, undefined, p.chartPalette?.()) };
    } catch (e) {
      return {
        ok: false,
        err: e instanceof Error ? e.message : "Render error",
      };
    }
  });

  let root: HTMLDivElement | undefined;
  const [ink, setInk] = createSignal<FigureInkTheme | undefined>();
  const measureInk = () => {
    if (root && p.inkFor) setInk(p.inkFor(root));
  };
  onMount(() => {
    // The widget's element is often still detached when this mounts (the
    // editor inserts it after building it): measure now for the common case
    // and again once it is in the document.
    measureInk();
    requestAnimationFrame(measureInk);
    setTimeout(measureInk, 0);
  });
  const inputs = () => {
    const h = hydrated();
    if (!h.ok) return undefined;
    const theme = ink();
    return theme ? applyInkTheme(h.inputs, theme) : h.inputs;
  };
  const errMsg = () => {
    const h = hydrated();
    return h.ok ? undefined : h.err;
  };

  createEffect(() => {
    if (hydrated().ok) p.onMeasured?.();
  });

  return (
    <div ref={root}>
      <Switch>
        {/* scheme="light": a document stays light in a dark app. Keyed
            colours (a table's column-header ground is the page key, CF cell
            text picks the base text key) must resolve against the light set,
            or a dark app paints black header cells and white values on pale
            tints. Dark GROUNDS inside the report are the ink theme's job. */}
        <Match when={inputs()}>
          {(fi) => (
            <FigureHolder figureInputs={fi()} height="ideal" sizing="zoom" scheme="light" />
          )}
        </Match>
        <Match when={errMsg()}>
          {(msg) => <div class="ui-pad text-danger text-xs">{msg()}</div>}
        </Match>
      </Switch>
    </div>
  );
}
