import { createEffect, createMemo, type JSX, Match, Switch } from "solid-js";
import { ChartHolder, type FigureInputs } from "panther";
import { type FigureBlock, t3 } from "lib";
import { buildFigureInputs } from "~/generate_visualization/mod";

type Props = {
  figure: FigureBlock;
  onMeasured?: () => void;
};

type Hydrated =
  | { ok: true; inputs: FigureInputs }
  | { ok: false; err: string };

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
      return { ok: false, err: e instanceof Error ? e.message : "Render error" };
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
