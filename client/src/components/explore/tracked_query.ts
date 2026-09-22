import { t3, TC, type APIResponseWithData } from "lib";
import type { StateHolder } from "panther";
import { createEffect, createSignal, type Accessor } from "solid-js";

// A read that re-runs whenever a tracked input of `source` changes (the
// scope, the metric, the config), unlike panther's createQuery, which runs
// once on mount. A superseded read is dropped by the version counter, so a
// fast scope switch never paints stale. `source` must read its inputs before
// its first await, which the cache reads do by taking them as arguments.
export function createTrackedQuery<T>(
  source: () => Promise<APIResponseWithData<T>>,
): Accessor<StateHolder<T>> {
  const [state, setState] = createSignal<StateHolder<T>>({
    status: "loading",
    msg: t3(TC.loading),
  });
  let version = 0;
  createEffect(() => {
    const promise = source();
    const thisVersion = ++version;
    setState({ status: "loading", msg: t3(TC.loading) });
    promise.then(
      (res) => {
        if (version !== thisVersion) return;
        setState(
          res.success
            ? { status: "ready", data: res.data }
            : { status: "error", err: res.err },
        );
      },
      (err) => {
        if (version !== thisVersion) return;
        setState({
          status: "error",
          err: err instanceof Error ? err.message : String(err),
        });
      },
    );
  });
  return state;
}
