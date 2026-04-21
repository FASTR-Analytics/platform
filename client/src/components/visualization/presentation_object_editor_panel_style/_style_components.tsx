import type { JSX } from "solid-js";

type StyleRevealGroupProps = {
  children: JSX.Element;
};

export function StyleRevealGroup(p: StyleRevealGroupProps) {
  return (
    <div class="ui-spy-sm border-base-200 border-l-2 pl-3 ml-1">
      {p.children}
    </div>
  );
}

type StyleSectionLabelProps = {
  children: JSX.Element;
};

export function StyleSectionLabel(p: StyleSectionLabelProps) {
  return (
    <div class="text-xs font-medium text-base-content/60 uppercase tracking-wide pb-1">
      {p.children}
    </div>
  );
}