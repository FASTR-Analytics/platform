import {
  t3,
  TC,
  type InstanceConfigAdminAreaLabels,
  type InstanceConfigFacilityColumns,
} from "lib";
import {
  Button,
  Checkbox,
  FrameTop,
  HeadingBarMainRibbon,
  Input,
  RadioGroup,
  SettingsSection,
  getSelectOptions,
  createButtonAction,
} from "panther";
import { For, Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  thisLoggedInUserEmail: string;
};

function stripAdminSuffix(v: string | undefined, level: number): string {
  return (v ?? "").replace(new RegExp(`\\s*\\(AA${level}\\)$`), "");
}

function withAdminSuffix(v: string, level: number): string | undefined {
  const trimmed = v.trim();
  return trimmed ? `${trimmed} (AA${level})` : undefined;
}

export function InstanceSettings(p: Props) {
  const [selectedMaxAdminArea, setSelectedMaxAdminArea] = createSignal<number>(
    instanceState.maxAdminArea,
  );

  const [countryIso3, setCountryIso3] = createSignal<string>(
    instanceState.countryIso3 || "",
  );

  const [needsSavingMaxAdminArea, setNeedsSavingMaxAdminArea] =
    createSignal(false);
  const [needsSavingFacilityCols, setNeedsSavingFacilityCols] =
    createSignal(false);
  const [needsSavingCountryIso3, setNeedsSavingCountryIso3] =
    createSignal(false);

  const [includeNames, setIncludeNames] = createSignal<boolean>(
    instanceState.facilityColumns.includeNames || false,
  );
  const [includeTypes, setIncludeTypes] = createSignal<boolean>(
    instanceState.facilityColumns.includeTypes || false,
  );
  const [includeOwnership, setIncludeOwnership] = createSignal<boolean>(
    instanceState.facilityColumns.includeOwnership || false,
  );
  const [includeCustom1, setIncludeCustom1] = createSignal<boolean>(
    instanceState.facilityColumns.includeCustom1 || false,
  );
  const [includeCustom2, setIncludeCustom2] = createSignal<boolean>(
    instanceState.facilityColumns.includeCustom2 || false,
  );
  const [includeCustom3, setIncludeCustom3] = createSignal<boolean>(
    instanceState.facilityColumns.includeCustom3 || false,
  );
  const [includeCustom4, setIncludeCustom4] = createSignal<boolean>(
    instanceState.facilityColumns.includeCustom4 || false,
  );
  const [includeCustom5, setIncludeCustom5] = createSignal<boolean>(
    instanceState.facilityColumns.includeCustom5 || false,
  );

  const [labelNames, setLabelNames] = createSignal<string>(
    instanceState.facilityColumns.labelNames || "",
  );
  const [labelTypes, setLabelTypes] = createSignal<string>(
    instanceState.facilityColumns.labelTypes || "",
  );
  const [labelOwnership, setLabelOwnership] = createSignal<string>(
    instanceState.facilityColumns.labelOwnership || "",
  );
  const [labelCustom1, setLabelCustom1] = createSignal<string>(
    instanceState.facilityColumns.labelCustom1 || "",
  );
  const [labelCustom2, setLabelCustom2] = createSignal<string>(
    instanceState.facilityColumns.labelCustom2 || "",
  );
  const [labelCustom3, setLabelCustom3] = createSignal<string>(
    instanceState.facilityColumns.labelCustom3 || "",
  );
  const [labelCustom4, setLabelCustom4] = createSignal<string>(
    instanceState.facilityColumns.labelCustom4 || "",
  );
  const [labelCustom5, setLabelCustom5] = createSignal<string>(
    instanceState.facilityColumns.labelCustom5 || "",
  );

  const [adminLabel2, setAdminLabel2] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label2, 2),
  );
  const [adminLabel3, setAdminLabel3] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label3, 3),
  );
  const [adminLabel4, setAdminLabel4] = createSignal<string>(
    stripAdminSuffix(instanceState.adminAreaLabels.label4, 4),
  );
  const [needsSavingAdminLabels, setNeedsSavingAdminLabels] =
    createSignal(false);

  const updateAdminAreaLabels = createButtonAction(async () => {
    const newConfig: InstanceConfigAdminAreaLabels = {
      label2: withAdminSuffix(adminLabel2(), 2),
      label3: withAdminSuffix(adminLabel3(), 3),
      label4: withAdminSuffix(adminLabel4(), 4),
    };
    const res = await serverActions.updateAdminAreaLabelsConfig(newConfig);
    if (res.success) {
      setNeedsSavingAdminLabels(false);
    }
    return res;
  });

  const updateMaxAdminArea = createButtonAction(async () => {
    const res = await serverActions.updateMaxAdminArea({
      maxAdminArea: selectedMaxAdminArea(),
    });
    if (res.success) {
      setNeedsSavingMaxAdminArea(false);
    }
    return res;
  });

  const updateCountryIso3 = createButtonAction(async () => {
    const res = await serverActions.updateCountryIso3({
      countryIso3: countryIso3(),
    });
    if (res.success) {
      setNeedsSavingCountryIso3(false);
    }
    return res;
  });

  const handleCheckboxChange = (
    setter: (value: boolean) => void,
    value: boolean,
  ) => {
    setter(value);
    setNeedsSavingFacilityCols(true);
  };

  const handleIso3Change = (value: string) => {
    setCountryIso3(value.toUpperCase());
    setNeedsSavingCountryIso3(true);
  };

  const handleLabelChange = (
    setter: (value: string) => void,
    value: string,
  ) => {
    setter(value);
    setNeedsSavingFacilityCols(true);
  };

  const facilityColumnOptions = [
    {
      key: "facility_name",
      label: t3({ en: "Facility Names", fr: "Noms des établissements", pt: "Nomes dos estabelecimentos de saúde" }),
      checked: includeNames,
      setChecked: setIncludeNames,
      labelValue: labelNames,
      setLabelValue: setLabelNames,
    },
    {
      key: "facility_type",
      label: t3({ en: "Facility Types", fr: "Types d'établissements", pt: "Tipos de estabelecimentos de saúde" }),
      checked: includeTypes,
      setChecked: setIncludeTypes,
      labelValue: labelTypes,
      setLabelValue: setLabelTypes,
    },
    {
      key: "facility_ownership",
      label: t3({
        en: "Facility Ownership",
        fr: "Propriété des établissements",
        pt: "Propriedade dos estabelecimentos de saúde",
      }),
      checked: includeOwnership,
      setChecked: setIncludeOwnership,
      labelValue: labelOwnership,
      setLabelValue: setLabelOwnership,
    },
    {
      key: "facility_custom_1",
      label: t3({ en: "Custom Field 1", fr: "Champ personnalisé 1", pt: "Campo personalizado 1" }),
      checked: includeCustom1,
      setChecked: setIncludeCustom1,
      labelValue: labelCustom1,
      setLabelValue: setLabelCustom1,
    },
    {
      key: "facility_custom_2",
      label: t3({ en: "Custom Field 2", fr: "Champ personnalisé 2", pt: "Campo personalizado 2" }),
      checked: includeCustom2,
      setChecked: setIncludeCustom2,
      labelValue: labelCustom2,
      setLabelValue: setLabelCustom2,
    },
    {
      key: "facility_custom_3",
      label: t3({ en: "Custom Field 3", fr: "Champ personnalisé 3", pt: "Campo personalizado 3" }),
      checked: includeCustom3,
      setChecked: setIncludeCustom3,
      labelValue: labelCustom3,
      setLabelValue: setLabelCustom3,
    },
    {
      key: "facility_custom_4",
      label: t3({ en: "Custom Field 4", fr: "Champ personnalisé 4", pt: "Campo personalizado 4" }),
      checked: includeCustom4,
      setChecked: setIncludeCustom4,
      labelValue: labelCustom4,
      setLabelValue: setLabelCustom4,
    },
    {
      key: "facility_custom_5",
      label: t3({ en: "Custom Field 5", fr: "Champ personnalisé 5", pt: "Campo personalizado 5" }),
      checked: includeCustom5,
      setChecked: setIncludeCustom5,
      labelValue: labelCustom5,
      setLabelValue: setLabelCustom5,
    },
  ];

  const updateFacilityColumns = createButtonAction(async () => {
    const newConfig: InstanceConfigFacilityColumns = {
      includeNames: includeNames(),
      includeTypes: includeTypes(),
      includeOwnership: includeOwnership(),
      includeCustom1: includeCustom1(),
      includeCustom2: includeCustom2(),
      includeCustom3: includeCustom3(),
      includeCustom4: includeCustom4(),
      includeCustom5: includeCustom5(),
      labelNames: labelNames() || undefined,
      labelTypes: labelTypes() || undefined,
      labelOwnership: labelOwnership() || undefined,
      labelCustom1: labelCustom1() || undefined,
      labelCustom2: labelCustom2() || undefined,
      labelCustom3: labelCustom3() || undefined,
      labelCustom4: labelCustom4() || undefined,
      labelCustom5: labelCustom5() || undefined,
    };
    const res = await serverActions.updateFacilityColumnsConfig(newConfig);
    if (res.success) {
      setNeedsSavingFacilityCols(false);
    }
    return res;
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBarMainRibbon heading={t3(TC.settings)}></HeadingBarMainRibbon>
      }
    >
      <div class="ui-pad ui-spy h-full w-full">
        <SettingsSection
          header={t3({ en: "Country", fr: "Pays", pt: "País" })}
          rightChildren={
            <Show when={needsSavingCountryIso3()}>
              <Button
                onClick={() => updateCountryIso3.click()}
                state={updateCountryIso3.state()}
                intent="success"
              >
                {t3({
                  en: "Update country ISO3 code",
                  fr: "Mettre à jour le code ISO3 du pays",
                  pt: "Atualizar o código ISO3 do país",
                })}
              </Button>
            </Show>
          }
        >
          <Input value={countryIso3()} onChange={(v) => handleIso3Change(v)} />
        </SettingsSection>

        <SettingsSection
          header={t3({
            en: "Max admin area level",
            fr: "Niveau maximal d'unité administrative",
            pt: "Nível máximo de zona administrativa",
          })}
          rightChildren={
            <Show when={needsSavingMaxAdminArea()}>
              <Button
                onClick={() => updateMaxAdminArea.click()}
                state={updateMaxAdminArea.state()}
                intent="success"
              >
                {t3({
                  en: "Update max admin area level",
                  fr: "Mettre à jour le niveau maximal d'unité administrative",
                  pt: "Atualizar o nível máximo de zona administrativa",
                })}
              </Button>
            </Show>
          }
        >
          <RadioGroup
            options={getSelectOptions(["2", "3", "4"])}
            value={String(selectedMaxAdminArea())}
            onChange={(v) => {
              setSelectedMaxAdminArea(Number(v));
              setNeedsSavingMaxAdminArea(true);
            }}
          />
        </SettingsSection>

        <SettingsSection
          header={t3({
            en: "Admin area labels",
            fr: "Libellés des unités administratives",
            pt: "Rótulos das zonas administrativas",
          })}
          rightChildren={
            <Show when={needsSavingAdminLabels()}>
              <Button
                onClick={() => updateAdminAreaLabels.click()}
                state={updateAdminAreaLabels.state()}
                intent="success"
              >
                {t3({
                  en: "Update admin area labels",
                  fr: "Mettre à jour les libellés",
                  pt: "Atualizar os rótulos das zonas administrativas",
                })}
              </Button>
            </Show>
          }
        >
          <div class="ui-spy-sm">
            <div class="ui-text-caption">
              {t3({
                en: 'Enter the singular form (e.g. "District" not "Districts"). Leave blank to use the default.',
                fr: "Saisissez la forme singulière (par ex. « District » et non « Districts »). Laissez vide pour utiliser la valeur par défaut.",
                pt: 'Introduza a forma singular (por ex. "Distrito" e não "Distritos"). Deixe em branco para utilizar a predefinição.',
              })}
            </div>
            <For
              each={[
                {
                  level: 2 as const,
                  value: adminLabel2,
                  setter: setAdminLabel2,
                  exampleEn: "Region",
                  exampleFr: "Région",
                },
                {
                  level: 3 as const,
                  value: adminLabel3,
                  setter: setAdminLabel3,
                  exampleEn: "District",
                  exampleFr: "District",
                },
                {
                  level: 4 as const,
                  value: adminLabel4,
                  setter: setAdminLabel4,
                  exampleEn: "Catchment",
                  exampleFr: "Zone",
                },
              ].filter((row) => row.level <= instanceState.maxAdminArea)}
            >
              {(row) => (
                <div class="ui-gap flex items-center">
                  <div class="w-56">
                    {t3({
                      en: `Admin area ${row.level}`,
                      fr: `Unité administrative ${row.level}`,
                      pt: `Zona administrativa ${row.level}`,
                    })}
                  </div>
                  <div class="w-96">
                    <Input
                      value={row.value()}
                      onChange={(value) => {
                        row.setter(value);
                        setNeedsSavingAdminLabels(true);
                      }}
                      placeholder={t3({
                        en: `e.g. ${row.exampleEn}`,
                        fr: `ex. ${row.exampleFr}`,
                        pt: `por ex. ${row.exampleEn}`,
                      })}
                      fullWidth
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </SettingsSection>

        <SettingsSection
          header={t3({
            en: "Facility columns",
            fr: "Colonnes des établissements",
            pt: "Colunas dos estabelecimentos de saúde",
          })}
          rightChildren={
            <Show when={needsSavingFacilityCols()}>
              <Button
                onClick={() => updateFacilityColumns.click()}
                state={updateFacilityColumns.state()}
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
          <div class="ui-gap ui-spy-sm">
            <For each={facilityColumnOptions}>
              {(option) => (
                <div class="ui-gap flex items-center">
                  <div class="w-56">
                    <Checkbox
                      checked={option.checked()}
                      onChange={(checked) =>
                        handleCheckboxChange(option.setChecked, checked)
                      }
                      label={option.label}
                    />
                  </div>

                  <Show when={option.checked()}>
                    <div class="w-96">
                      <Input
                        value={option.labelValue()}
                        onChange={(value) =>
                          handleLabelChange(option.setLabelValue, value)
                        }
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
        </SettingsSection>

      </div>
    </FrameTop>
  );
}
