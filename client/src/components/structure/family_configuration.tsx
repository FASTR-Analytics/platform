import {
  t3,
  type FacilityFamily,
  type StructureColumns,
  type StructureSchema,
} from "lib";
import {
  Button,
  Checkbox,
  Card,
  FrameTop,
  HeadingBar,
  Input,
  RadioGroup,
  createButtonAction,
  getSelectOptions,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { structureSchemaForFamily } from "~/state/instance/t1_store";

type Props = {
  family: FacilityFamily;
  backToInstance: () => void;
};

// Depth and the facility columns save INDEPENDENTLY. The server refuses a
// depth change while that family's registry holds facilities (config.ts), and
// a combined payload would take the column edits down with the refusal. Each
// save therefore sends the STORED value for the half it is not editing, so a
// column save can never trip the depth guard.
//
// Both halves read through to the store for anything the user has not touched:
// an SSE config_updated lands live, and two admins editing different columns no
// longer clobber each other.
export function FamilyConfiguration(p: Props) {
  const stored = () => structureSchemaForFamily(p.family);

  const [depthEdit, setDepthEdit] = createSignal<1 | 2 | 3 | 4 | undefined>(
    undefined,
  );
  const depth = () => depthEdit() ?? stored().adminDepth;
  const depthDirty = () => depthEdit() !== undefined;

  const [columnEdits, setColumnEdits] = createSignal<Partial<StructureColumns>>(
    {},
  );
  const columnsDirty = () => Object.keys(columnEdits()).length > 0;

  function col<K extends keyof StructureColumns>(k: K): StructureColumns[K] {
    const edit = columnEdits()[k];
    return edit === undefined ? stored()[k] : edit;
  }

  function setCol<K extends keyof StructureColumns>(
    k: K,
    v: StructureColumns[K],
  ): void {
    setColumnEdits((prev) => ({ ...prev, [k]: v }));
  }

  // A label the user cleared is stored as absent, not as an empty string.
  function labelOrUndefined(v: string | undefined): string | undefined {
    return v && v.trim() !== "" ? v : undefined;
  }

  const facilityColumnOptions = [
    {
      includeKey: "includeNames",
      labelKey: "labelNames",
      label: t3({
        en: "Facility Names",
        fr: "Noms des établissements",
        pt: "Nomes dos estabelecimentos de saúde",
      }),
    },
    {
      includeKey: "includeTypes",
      labelKey: "labelTypes",
      label: t3({
        en: "Facility Types",
        fr: "Types d'établissements",
        pt: "Tipos de estabelecimentos de saúde",
      }),
    },
    {
      includeKey: "includeOwnership",
      labelKey: "labelOwnership",
      label: t3({
        en: "Facility Ownership",
        fr: "Propriété des établissements",
        pt: "Propriedade dos estabelecimentos de saúde",
      }),
    },
    {
      includeKey: "includeCustom1",
      labelKey: "labelCustom1",
      label: t3({
        en: "Custom Field 1",
        fr: "Champ personnalisé 1",
        pt: "Campo personalizado 1",
      }),
    },
    {
      includeKey: "includeCustom2",
      labelKey: "labelCustom2",
      label: t3({
        en: "Custom Field 2",
        fr: "Champ personnalisé 2",
        pt: "Campo personalizado 2",
      }),
    },
    {
      includeKey: "includeCustom3",
      labelKey: "labelCustom3",
      label: t3({
        en: "Custom Field 3",
        fr: "Champ personnalisé 3",
        pt: "Campo personalizado 3",
      }),
    },
    {
      includeKey: "includeCustom4",
      labelKey: "labelCustom4",
      label: t3({
        en: "Custom Field 4",
        fr: "Champ personnalisé 4",
        pt: "Campo personalizado 4",
      }),
    },
    {
      includeKey: "includeCustom5",
      labelKey: "labelCustom5",
      label: t3({
        en: "Custom Field 5",
        fr: "Champ personnalisé 5",
        pt: "Campo personalizado 5",
      }),
    },
  ] as const;

  const updateDepth = createButtonAction(async () => {
    const schema: StructureSchema = { ...stored(), adminDepth: depth() };
    const res = await serverActions.updateStructureSchema({
      family: p.family,
      schema,
    });
    if (res.success) {
      setDepthEdit(undefined);
    }
    return res;
  });

  const updateColumns = createButtonAction(async () => {
    const schema: StructureSchema = {
      ...stored(),
      includeNames: col("includeNames"),
      includeTypes: col("includeTypes"),
      includeOwnership: col("includeOwnership"),
      includeCustom1: col("includeCustom1"),
      includeCustom2: col("includeCustom2"),
      includeCustom3: col("includeCustom3"),
      includeCustom4: col("includeCustom4"),
      includeCustom5: col("includeCustom5"),
      labelNames: labelOrUndefined(col("labelNames")),
      labelTypes: labelOrUndefined(col("labelTypes")),
      labelOwnership: labelOrUndefined(col("labelOwnership")),
      labelCustom1: labelOrUndefined(col("labelCustom1")),
      labelCustom2: labelOrUndefined(col("labelCustom2")),
      labelCustom3: labelOrUndefined(col("labelCustom3")),
      labelCustom4: labelOrUndefined(col("labelCustom4")),
      labelCustom5: labelOrUndefined(col("labelCustom5")),
      adminDepth: stored().adminDepth,
    };
    const res = await serverActions.updateStructureSchema({
      family: p.family,
      schema,
    });
    if (res.success) {
      setColumnEdits({});
    }
    return res;
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          onBack={p.backToInstance}
          heading={
            p.family === "hmis"
              ? t3({
                en: "HMIS configuration",
                fr: "Configuration SNIS",
                pt: "Configuração SNIS",
              })
              : t3({
                en: "HFA configuration",
                fr: "Configuration Enquêtes FOSA",
                pt: "Configuração FOSA",
              })
          }
        />
      }
    >
      <div class="ui-pad ui-spy max-w-3xl overflow-auto">
        <Card
          header={t3({
            en: "Max admin area level",
            fr: "Niveau maximal d'unité administrative",
            pt: "Nível máximo de zona administrativa",
          })}
          headerRight={
            <Show when={depthDirty()}>
              <Button
                onClick={() => updateDepth.click()}
                state={updateDepth.state()}
                intent="success"
              >
                {t3({
                  en: "Update admin area level",
                  fr: "Mettre à jour le niveau d'unité administrative",
                  pt: "Atualizar o nível de zona administrativa",
                })}
              </Button>
            </Show>
          }
        >
          <div class="ui-spy-sm">
            <div class="ui-text-caption">
              {t3({
                en: "How many admin area levels this registry's facilities are organised into. Changing it requires deleting this registry's facilities first.",
                fr: "Nombre de niveaux d'unités administratives utilisés par les établissements de ce registre. Toute modification nécessite d'abord la suppression des établissements de ce registre.",
                pt: "Quantos níveis de zonas administrativas os estabelecimentos deste registo utilizam. Alterá-lo exige eliminar primeiro os estabelecimentos deste registo.",
              })}
            </div>
            <RadioGroup
              options={getSelectOptions(["2", "3", "4"])}
              value={String(depth())}
              onChange={(v) => setDepthEdit(Number(v) as 1 | 2 | 3 | 4)}
            />
          </div>
        </Card>

        <Card
          header={t3({
            en: "Facility columns",
            fr: "Colonnes des établissements",
            pt: "Colunas dos estabelecimentos de saúde",
          })}
          headerRight={
            <Show when={columnsDirty()}>
              <Button
                onClick={() => updateColumns.click()}
                state={updateColumns.state()}
                intent="success"
              >
                {t3({
                  en: "Update facility columns",
                  fr: "Mettre à jour les colonnes des établissements",
                  pt: "Atualizar as colunas dos estabelecimentos de saúde",
                })}
              </Button>
            </Show>
          }
        >
          <div class="ui-spy-sm">
            <div class="ui-text-caption">
              {t3({
                en: "Which optional columns this registry's facility imports carry, and the label each is shown under.",
                fr: "Colonnes facultatives présentes dans les importations d'établissements de ce registre, et le libellé sous lequel chacune est affichée.",
                pt: "Colunas opcionais incluídas nas importações de estabelecimentos deste registo e o rótulo com que cada uma é apresentada.",
              })}
            </div>
            <div class="ui-gap ui-spy-sm">
              <For each={facilityColumnOptions}>
                {(option) => (
                  <div class="ui-gap flex items-center">
                    <div class="w-56">
                      <Checkbox
                        checked={col(option.includeKey)}
                        onChange={(checked) =>
                          setCol(option.includeKey, checked)}
                        label={option.label}
                      />
                    </div>

                    <Show when={col(option.includeKey)}>
                      <div class="w-96">
                        <Input
                          value={col(option.labelKey) ?? ""}
                          onChange={(value) => setCol(option.labelKey, value)}
                          placeholder={t3({
                            en: `Custom label for ${option.label.toLowerCase()}`,
                            fr: `Libellé personnalisé pour ${option.label.toLowerCase()}`,
                            pt: `Rótulo personalizado para ${option.label.toLowerCase()}`,
                          })}
                          fullWidth
                        />
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Card>
      </div>
    </FrameTop>
  );
}
