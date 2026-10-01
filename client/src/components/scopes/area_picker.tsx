import { type FacilityFamily, t3 } from "lib";
import { createQuery, RadioGroup, Select, StateHolderWrapper } from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";

// The picker's working state: "single with no area chosen yet" is a real
// interim UI state (adminArea2 undefined) that the editor rejects on save.
// The stored value is always string | null (null = every area).
export type AreaSelection =
  | { mode: "all" }
  | { mode: "single"; adminArea2: string | undefined };

export function areaSelectionFromStored(
  adminArea2: string | null,
): AreaSelection {
  return adminArea2 === null ? { mode: "all" } : { mode: "single", adminArea2 };
}

type Props = {
  // The section's own family: its area is picked from that family's registry.
  family: FacilityFamily;
  selection: AreaSelection;
  onChange: (s: AreaSelection) => void;
};

export function AreaPicker(p: Props) {
  const areasQuery = createQuery<string[]>(() =>
    serverActions.listAdminArea2s({ family: p.family })
  );

  const chosenArea = () =>
    p.selection.mode === "single" ? p.selection.adminArea2 : undefined;

  return (
    <div class="ui-spy-sm">
      <RadioGroup<"all" | "single">
        label={t3({ en: "Geography", fr: "Géographie", pt: "Geografia" })}
        value={p.selection.mode}
        options={[
          {
            value: "all",
            label: t3({
              en: "Every area",
              fr: "Toutes les zones",
              pt: "Todas as zonas",
            }),
          },
          {
            value: "single",
            label: `${t3({ en: "One", fr: "Une seule :", pt: "Uma só:" })} ${
              t3(getAdminAreaLabel(2))
            }`,
          },
        ]}
        onChange={(v) =>
          p.onChange(
            v === "all"
              ? { mode: "all" }
              : { mode: "single", adminArea2: chosenArea() },
          )}
      />
      <Show when={p.selection.mode === "single"}>
        <StateHolderWrapper state={areasQuery.state()}>
          {(areas) => {
            // The options array must be referentially STABLE across picks: a
            // selection-dependent list would recreate every <option> node on
            // each pick and the browser resets the select to its first
            // option. The one entry that isn't in the family's structure list
            // is the INITIAL stored value (a structure re-upload can orphan
            // it: cleanupUnusedAdminAreas); it stays visible and selectable
            // because a blank select whose next save rewrites the scope is a
            // silent change to every product that carries it. Users can only
            // ever pick from this fixed list, so no later selection can need
            // an entry that isn't already here.
            const initial = chosenArea();
            const options = [
              ...(initial !== undefined && !areas.includes(initial)
                ? [{
                  value: initial,
                  label: `${initial} (${
                    t3({
                      en: "not in the current structure",
                      fr: "absente de la structure actuelle",
                      pt: "não consta da estrutura atual",
                    })
                  })`,
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
    </div>
  );
}
