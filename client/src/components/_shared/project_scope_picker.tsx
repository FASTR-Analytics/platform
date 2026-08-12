import { t3 } from "lib";
import { createQuery, RadioGroup, Select, StateHolderWrapper } from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";

// The picker's working state: "single with no area chosen yet" is a real
// interim UI state (adminArea2 undefined) that callers must reject on save —
// the stored value is always string | null (null = national).
export type ProjectScopeSelection =
  | { mode: "national" }
  | { mode: "single"; adminArea2: string | undefined };

export function scopeSelectionFromStored(
  adminArea2: string | null,
): ProjectScopeSelection {
  return adminArea2 === null ? { mode: "national" } : { mode: "single", adminArea2 };
}

// undefined = incomplete (single mode with no area chosen).
export function storedValueFromScopeSelection(
  sel: ProjectScopeSelection,
): string | null | undefined {
  return sel.mode === "national" ? null : sel.adminArea2;
}

type Props = {
  selection: ProjectScopeSelection;
  onChange: (s: ProjectScopeSelection) => void;
};

export function ProjectScopePicker(p: Props) {
  const areasQuery = createQuery<string[]>(() => serverActions.listAdminArea2s({}));

  const chosenArea = () =>
    p.selection.mode === "single" ? p.selection.adminArea2 : undefined;

  return (
    <div class="ui-spy-sm">
      <RadioGroup<"national" | "single">
        label={t3({
          en: "Project scope",
          fr: "Portée du projet",
          pt: "Âmbito do projeto",
        })}
        value={p.selection.mode}
        options={[
          {
            value: "national",
            label: t3({ en: "National", fr: "National", pt: "Nacional" }),
          },
          {
            value: "single",
            label: `${
              t3({ en: "Single", fr: "Unique :", pt: "Único:" })
            } ${t3(getAdminAreaLabel(2))}`,
          },
        ]}
        onChange={(v) =>
          p.onChange(
            v === "national"
              ? { mode: "national" }
              : { mode: "single", adminArea2: chosenArea() },
          )}
      />
      <Show when={p.selection.mode === "single"}>
        <StateHolderWrapper state={areasQuery.state()} noPad>
          {(areas) => {
            // The options array must be referentially STABLE across picks: a
            // selection-dependent list would recreate every <option> node on
            // each pick and the browser resets the select to its first
            // option. The one entry that isn't in the structure list is the
            // INITIAL stored value (a structure re-upload can orphan it —
            // cleanupUnusedAdminAreas); it stays visible and selectable
            // because a blank select whose next save rewrites the identity
            // is exactly what the "never silently cleared" ruling forbids.
            // Users can only ever pick from this fixed list, so no later
            // selection can need an entry that isn't already here.
            const initial = chosenArea();
            const options = [
              ...(initial !== undefined && !areas.includes(initial)
                ? [{
                  value: initial,
                  label: `${initial} — ${
                    t3({
                      en: "not in the current structure",
                      fr: "absente de la structure actuelle",
                      pt: "não consta da estrutura atual",
                    })
                  }`,
                }]
                : []),
              ...areas.map((a) => ({ value: a, label: a })),
            ];
            return (
              <Select
                value={chosenArea()}
                options={options}
                onChange={(v) => p.onChange({ mode: "single", adminArea2: v })}
                placeholder={t3({
                  en: "Select an area",
                  fr: "Sélectionner une zone",
                  pt: "Selecionar uma zona",
                })}
                fullWidth
              />
            );
          }}
        </StateHolderWrapper>
      </Show>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "A scoped project sees the attached results package as if it contained only that area. Metrics with no area breakdown remain national.",
          fr: "Un projet à portée limitée voit le paquet de résultats attaché comme s'il ne contenait que cette zone. Les indicateurs sans ventilation par zone restent nationaux.",
          pt: "Um projeto com âmbito limitado vê o pacote de resultados anexado como se contivesse apenas essa zona. Os indicadores sem desagregação por zona permanecem nacionais.",
        })}
      </div>
    </div>
  );
}
