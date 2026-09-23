import type { ProductSummary } from "lib";
import { Icon } from "panther";
import { Show } from "solid-js";
import { packageLabel, scopeLabel } from "~/components/_shared/mod.ts";

type Props = {
  product: ProductSummary | undefined;
  // Present when the viewer may change the pair: the chip is then the button
  // that opens PackageScopeModal. Absent, it is a static label.
  onClick?: () => void;
};

// The (package, scope) pair in the editor headers. It wears the package accent
// so the pair a document renders from is never something to hunt for.
export function PackageScopeChip(p: Props) {
  const text = () => {
    if (!p.product) return "";
    return `${packageLabel(p.product.runId)} · ${scopeLabel(p.product.adminArea2)}`;
  };
  const layout =
    "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 font-700 text-sm whitespace-nowrap";
  const content = () => (
    <>
      <span class="inline-block w-3.5 flex-none">
        <Icon iconName="package" />
      </span>
      <span class="truncate">{text()}</span>
    </>
  );

  return (
    <Show
      when={p.onClick}
      fallback={<div class={`${layout} ui-fill-package`}>{content()}</div>}
    >
      {(onClick) => (
        <button
          type="button"
          class={`${layout} ui-hoverable-package ui-focusable text-package-content`}
          onClick={() => onClick()()}
        >
          {content()}
        </button>
      )}
    </Show>
  );
}
