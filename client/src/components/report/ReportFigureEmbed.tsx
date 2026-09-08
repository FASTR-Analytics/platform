import { createEffect, createMemo, type JSX, Match, Show, Switch } from "solid-js";
import { FigureHolder, type FigureInputs } from "panther";
import {
  type FigureBlock,
  type FigureBundle,
  type PackageScope,
  type RunAuthoringContext,
  t3,
} from "lib";
import { buildFigureInputs, isFigureBundleStale } from "~/generate_visualization/mod";
import { StaleFigureBadge } from "~/components/figure_editor/stale_figure_badge";

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
      return { ok: true, inputs: buildFigureInputs(bundle) };
    } catch (e) {
      return {
        ok: false,
        err: e instanceof Error ? e.message : "Render error",
      };
    }
  });

  const inputs = () => {
    const h = hydrated();
    return h.ok ? h.inputs : undefined;
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
    <div class="ui-spy-sm">
      <Switch>
        <Match when={inputs()}>
          {(fi) => (
            <FigureHolder figureInputs={fi()} height="ideal" sizing="zoom" />
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
