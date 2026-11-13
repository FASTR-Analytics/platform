import { resolveScope } from "~/state/instance/t1_store";
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
import {
  buildFigureInputs,
  isFigureBundleStale,
} from "~/generate_visualization/mod";
import { describeFigureUnavailable } from "~/components/_shared/mod.ts";
import { StaleFigureBadge } from "~/components/_shared/figure_editor/mod.ts";
import { applyInkTheme, type FigureInkTheme } from "~/generate_report/mod";
import type { ReportFigureDraw } from "~/components/instance/copilot/mod.ts";

// What the report editor hands each embed so it can judge and update its own
// figure. Absent on surfaces that only display
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
  // Told the ground this embed sits on each time its ink is measured.
  onGround?: (ground: FigureGround) => void;
};

// The ground a figure sits on in a report: its colour, and the ink the
// report draws the figure in there.
export type FigureGround = { color: string; ink: FigureInkTheme | undefined };

// The figure inputs a report draws a figure with: its stored bundle under the
// report's chart palette, then the ink of the ground it sits on.
export function buildReportFigureInputs(
  figure: FigureBlock,
  chartPalette: FastrChartPalette | undefined,
  ink: FigureInkTheme | undefined,
): ReportFigureDraw {
  const bundle = figure.bundle;
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
    const built = buildFigureInputs(bundle, undefined, chartPalette);
    if (!built.ok) {
      return { ok: false, err: describeFigureUnavailable(built.unavailable) };
    }
    return {
      ok: true,
      inputs: ink ? applyInkTheme(built.inputs, ink) : built.inputs,
    };
  } catch (e) {
    return {
      ok: false,
      err: e instanceof Error ? e.message : "Render error",
    };
  }
}

// The first background at least half opaque, from the element up through its
// ancestors, as Report Forge's isDarkGroundBehind finds it; white where none
// is, which is what the base stylesheet paints the page.
function groundColorBehind(el: Element): string {
  const win = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node && win; node = node.parentElement) {
    const m = /^rgba?\(([^)]+)\)$/.exec(
      win.getComputedStyle(node).backgroundColor.trim(),
    );
    const [r, g, b, a = 1] = m?.[1].split(",").map(parseFloat) ?? [];
    if (a >= 0.5 && [r, g, b].every((v) => Number.isFinite(v))) {
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return "#ffffff";
}

export function ReportFigureEmbed(p: Props): JSX.Element {
  let root: HTMLDivElement | undefined;
  const [ink, setInk] = createSignal<FigureInkTheme | undefined>();
  const measureInk = () => {
    if (!root || !p.inkFor) return;
    const measured = p.inkFor(root);
    setInk(measured);
    p.onGround?.({ color: groundColorBehind(root), ink: measured });
  };
  const drawn = createMemo(() =>
    buildReportFigureInputs(p.figure, p.chartPalette?.(), ink())
  );
  onMount(() => {
    // The widget's element is often still detached when this mounts (the
    // editor inserts it after building it): measure now for the common case
    // and again once it is in the document.
    measureInk();
    requestAnimationFrame(measureInk);
    setTimeout(measureInk, 0);
  });
  const inputs = () => {
    const d = drawn();
    return d.ok ? d.inputs : undefined;
  };
  const errMsg = () => {
    const d = drawn();
    return d.ok ? undefined : d.err;
  };

  const staleBadge = () => {
    const bundle = p.figure.bundle;
    const stale = p.stale;
    if (
      !bundle || !stale ||
      !isFigureBundleStale(bundle, resolveScope(stale.scope))
    ) {
      return undefined;
    }
    return { bundle, stale };
  };

  // Keyed on whether it draws, so a re-ink does not measure again.
  const drawable = createMemo(() => drawn().ok);
  createEffect(() => {
    const ok = drawable();
    const onMeasured = p.onMeasured;
    if (ok) onMeasured?.();
  });

  return (
    <div ref={root} class="ui-spy-sm">
      <Switch>
        {
          /* scheme="light": a document stays light in a dark app. Keyed
            colours (a table's column-header ground is the page key, CF cell
            text picks the base text key) must resolve against the light set,
            or a dark app paints black header cells and white values on pale
            tints. Dark GROUNDS inside the report are the ink theme's job. */
        }
        <Match when={inputs()}>
          {(fi) => (
            <FigureHolder
              figureInputs={fi()}
              height="ideal"
              sizing="zoom"
              scheme="light"
            />
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
