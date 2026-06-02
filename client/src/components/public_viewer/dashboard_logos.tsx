import { For } from "solid-js";
import { resolveLogoUrl } from "~/components/_shared/fastr_logos";

// A horizontal row of dashboard logos. Shared by the viewer header (both
// placements) and the "About this dashboard" modal. Each logo is contained
// within a fixed max-height/max-width box (object-contain preserves aspect
// ratio) — HTML rendering, no DU/raster sizing.
export function DashboardLogos(p: { selected: string[] }) {
  return (
    <div class="ui-gap flex items-center">
      <For each={p.selected}>
        {(logo) => (
          <img
            src={resolveLogoUrl(logo)}
            alt=""
            class="max-h-8 max-w-40 object-contain"
          />
        )}
      </For>
    </div>
  );
}
