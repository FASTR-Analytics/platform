import {
  type HfaRegistryFacility,
  type HfaRegistrySaveResult,
  type OptionalFacilityColumn,
  t3,
} from "lib";
import {
  AlertComponentProps,
  createFormAction,
  Input,
  ModalContainer,
} from "panther";
import { For, Show } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  getAdminAreaLabel,
  getAdminAreaLabelForLevel,
} from "~/state/instance/_util_disaggregation_label";
import {
  hfaFacilityColumnLabel,
  hfaFacilitySourceLabel,
} from "../../_shared/mod.ts";

type Props = {
  facility: HfaRegistryFacility;
  enabled: OptionalFacilityColumn[];
  // Per level, the area names the registry holds, so a name it lacks is
  // flagged before saving adds it.
  areaNames: Map<number, Set<string>>;
};

// One HFA facility's admin areas and columns. Level 1 is the country and is
// not edited here. Every value changed becomes the user's, so later rounds
// keep it by default.
export function EditHfaFacility(
  p: AlertComponentProps<Props, HfaRegistrySaveResult>,
) {
  const [admin, setAdmin] = createStore<string[]>([...p.facility.admin]);
  const [optional, setOptional] = createStore<
    Partial<Record<OptionalFacilityColumn, string>>
  >({ ...p.facility.optional });

  const isNewName = (index: number) => {
    const name = admin[index].trim();
    return name !== "" && name !== p.facility.admin[index] &&
      !(p.areaNames.get(index + 1)?.has(name) ?? false);
  };

  const save = createFormAction(
    () =>
      serverActions.editHfaFacility({
        facilityId: p.facility.facilityId,
        admin: [...unwrap(admin)],
        optional: { ...unwrap(optional) },
      }),
    (result) => p.close(result),
  );

  return (
    <ModalContainer
      title={t3({
        en: "Edit facility",
        fr: "Modifier l'établissement",
        pt: "Editar o estabelecimento",
      })}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <div class="ui-spy">
        <div class="font-mono text-sm">{p.facility.facilityId}</div>
        <div class="ui-spy-sm">
          <div class="text-base-content-muted text-sm">
            {t3({
              en: `Admin areas: ${
                hfaFacilitySourceLabel(p.facility.sources.admin)
              }`,
              fr: `Unités administratives : ${
                hfaFacilitySourceLabel(p.facility.sources.admin)
              }`,
              pt: `Zonas administrativas: ${
                hfaFacilitySourceLabel(p.facility.sources.admin)
              }`,
            })}
          </div>
          <div class="text-sm">
            {t3(getAdminAreaLabel(1))}: {p.facility.admin[0]}
          </div>
          <For each={p.facility.admin.slice(1)}>
            {(_, i) => {
              const index = i() + 1;
              return (
                <div class="ui-spy-sm">
                  <Input
                    label={t3(getAdminAreaLabelForLevel(index + 1))}
                    value={admin[index]}
                    onChange={(v) => setAdmin(index, v)}
                    fullWidth
                  />
                  <Show when={isNewName(index)}>
                    <div class="text-base-content-muted text-sm">
                      {t3({
                        en:
                          "No HFA facility is in an area of this name at this level: saving adds it.",
                        fr:
                          "Aucun établissement HFA n'est dans une zone de ce nom à ce niveau : l'enregistrement l'ajoute.",
                        pt:
                          "Nenhum estabelecimento HFA está numa zona com este nome neste nível: guardar acrescenta-a.",
                      })}
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
        <For each={p.enabled}>
          {(column) => (
            <div class="ui-spy-sm">
              <Input
                label={hfaFacilityColumnLabel(column)}
                value={optional[column] ?? ""}
                onChange={(v) => setOptional(column, v)}
                fullWidth
              />
              <div class="text-base-content-muted text-sm">
                {hfaFacilitySourceLabel(p.facility.sources[column])}
              </div>
            </div>
          )}
        </For>
      </div>
    </ModalContainer>
  );
}
