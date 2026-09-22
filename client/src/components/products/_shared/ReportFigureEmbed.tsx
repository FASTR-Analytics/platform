import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { FigureHolder, type FigureInputs } from "panther";
import {
  type FastrChartPalette,
  type FigureBlock,
  type FigureBundle,
  type PackageScope,
  type RunAuthoringContext,
  t3,
} from "lib";
import { buildFigureInputs, isFigureBundleStale } from "~/generate_visualization/mod";
import { StaleFigureBadge } from "~/components/_shared/figure_editor/mod.ts";
import { applyInkTheme, type FigureInkTheme } from "~/generate_report/mod";

// What the report editor hands each embed so it can judge and update its own
// figure (PLAN_PRODUCTS_RESTRUCTURE D4). Absent on surfaces that only display
// (version previews), where no badge is shown.
export type FigureStaleContext = {
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
  canEdit: boolean;
  onUpdated: (bundle: FigureBundle) => void;
};

type Props = {
  figure: FigureBlock;
  stale?: FigureStaleContext;
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
          en: "Figure has no stored inputs",
          fr: "La figure n'a pas de données enregistrées",
          pt: "A figura não tem dados guardados",
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

  const staleBadge = () => {
    const bundle = p.figure.bundle;
    const stale = p.stale;
    if (!bundle || !stale || !isFigureBundleStale(bundle, stale.scope)) {
      return undefined;
    }
    return { bundle, stale };
  };

  createEffect(() => {
    if (hydrated().ok) p.onMeasured?.();
  });

  return (
    <div ref={root} class="ui-spy-sm">
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
      <Show when={staleBadge()} keyed>
        {(keyed) => (
          <StaleFigureBadge
            bundle={keyed.bundle}
            scope={keyed.stale.scope}
            authoringContext={keyed.stale.authoringContext}
            onUpdated={keyed.stale.onUpdated}
            canEdit={keyed.stale.canEdit}
          />
        )}
      </Show>
    </div>
  );
}
