import {
  InstanceDetail,
  _OPTIONAL_FACILITY_COLUMNS,
  getEnabledOptionalFacilityColumns,
  t,
  t2,
  T,
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
  StateHolderWrapper,
  TimQuery,
  getSelectOptions,
  timActionButton,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  thisLoggedInUserEmail: string;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceSettings(p: Props) {
  return (
    <StateHolderWrapper state={p.instanceDetail.state()}>
      {(keyedInstanceDetail) => {
        const [selectedMaxAdminArea, setSelectedMaxAdminArea] =
          createSignal<number>(keyedInstanceDetail.maxAdminArea);

        const [countryIso3, setCountryIso3] = createSignal<string>(
          keyedInstanceDetail.countryIso3 || "",
        );

        const [needsSavingMaxAdminArea, setNeedsSavingMaxAdminArea] =
          createSignal(false);
        const [needsSavingFacilityCols, setNeedsSavingFacilityCols] =
          createSignal(false);
        const [needsSavingCountryIso3, setNeedsSavingCountryIso3] =
          createSignal(false);

        const [includeNames, setIncludeNames] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeNames || false,
        );
        const [includeTypes, setIncludeTypes] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeTypes || false,
        );
        const [includeOwnership, setIncludeOwnership] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeOwnership || false,
        );
        const [includeCustom1, setIncludeCustom1] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeCustom1 || false,
        );
        const [includeCustom2, setIncludeCustom2] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeCustom2 || false,
        );
        const [includeCustom3, setIncludeCustom3] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeCustom3 || false,
        );
        const [includeCustom4, setIncludeCustom4] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeCustom4 || false,
        );
        const [includeCustom5, setIncludeCustom5] = createSignal<boolean>(
          keyedInstanceDetail.facilityColumns.includeCustom5 || false,
        );

        const [labelNames, setLabelNames] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelNames || "",
        );
        const [labelTypes, setLabelTypes] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelTypes || "",
        );
        const [labelOwnership, setLabelOwnership] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelOwnership || "",
        );
        const [labelCustom1, setLabelCustom1] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelCustom1 || "",
        );
        const [labelCustom2, setLabelCustom2] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelCustom2 || "",
        );
        const [labelCustom3, setLabelCustom3] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelCustom3 || "",
        );
        const [labelCustom4, setLabelCustom4] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelCustom4 || "",
        );
        const [labelCustom5, setLabelCustom5] = createSignal<string>(
          keyedInstanceDetail.facilityColumns.labelCustom5 || "",
        );

        const updateMaxAdminArea = timActionButton(
          () =>
            serverActions.updateMaxAdminArea({
              maxAdminArea: selectedMaxAdminArea(),
            }),
          p.instanceDetail.fetch,
        );

        const updateCountryIso3 = timActionButton(
          () =>
            serverActions.updateCountryIso3({
              countryIso3: countryIso3(),
            }),
          p.instanceDetail.fetch,
        );

        const handleCheckboxChange = (
          setter: (value: boolean) => void,
          value: boolean,
        ) => {
          setter(value);
          setNeedsSavingFacilityCols(true);
        };

        const handleIso3Change = (value: string) => {
          setCountryIso3(value);
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
            label: "Facility Names",
            checked: includeNames,
            setChecked: setIncludeNames,
            labelValue: labelNames,
            setLabelValue: setLabelNames,
          },
          {
            key: "facility_type",
            label: "Facility Types",
            checked: includeTypes,
            setChecked: setIncludeTypes,
            labelValue: labelTypes,
            setLabelValue: setLabelTypes,
          },
          {
            key: "facility_ownership",
            label: "Facility Ownership",
            checked: includeOwnership,
            setChecked: setIncludeOwnership,
            labelValue: labelOwnership,
            setLabelValue: setLabelOwnership,
          },
          {
            key: "facility_custom_1",
            label: "Custom Field 1",
            checked: includeCustom1,
            setChecked: setIncludeCustom1,
            labelValue: labelCustom1,
            setLabelValue: setLabelCustom1,
          },
          {
            key: "facility_custom_2",
            label: "Custom Field 2",
            checked: includeCustom2,
            setChecked: setIncludeCustom2,
            labelValue: labelCustom2,
            setLabelValue: setLabelCustom2,
          },
          {
            key: "facility_custom_3",
            label: "Custom Field 3",
            checked: includeCustom3,
            setChecked: setIncludeCustom3,
            labelValue: labelCustom3,
            setLabelValue: setLabelCustom3,
          },
          {
            key: "facility_custom_4",
            label: "Custom Field 4",
            checked: includeCustom4,
            setChecked: setIncludeCustom4,
            labelValue: labelCustom4,
            setLabelValue: setLabelCustom4,
          },
          {
            key: "facility_custom_5",
            label: "Custom Field 5",
            checked: includeCustom5,
            setChecked: setIncludeCustom5,
            labelValue: labelCustom5,
            setLabelValue: setLabelCustom5,
          },
        ];

        const updateFacilityColumns = timActionButton(() => {
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
          return serverActions.updateFacilityColumnsConfig(newConfig);
        }, p.instanceDetail.fetch);

        return (
          <FrameTop
            panelChildren={
              <HeadingBarMainRibbon
                heading={t2(T.FRENCH_UI_STRINGS.settings)}
              ></HeadingBarMainRibbon>
            }
          >
            <div class="ui-pad ui-spy h-full w-full">
              <SettingsSection
                header="Country"
                rightChildren={
                  <Show when={needsSavingCountryIso3()}>
                    <Button
                      onClick={() => updateCountryIso3.click()}
                      state={updateCountryIso3.state()}
                      intent="success"
                    >
                      Update country ISO3 code
                    </Button>
                  </Show>
                }
              >
                <Input
                  value={countryIso3()}
                  onChange={(v) => handleIso3Change(v)}
                />
              </SettingsSection>

              <SettingsSection
                header="Max admin area level"
                rightChildren={
                  <Show when={needsSavingMaxAdminArea()}>
                    <Button
                      onClick={() => updateMaxAdminArea.click()}
                      state={updateMaxAdminArea.state()}
                      intent="success"
                    >
                      Update max admin area level
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
                header="Facility columns"
                rightChildren={
                  <Show when={needsSavingFacilityCols()}>
                    <Button
                      onClick={() => updateFacilityColumns.click()}
                      state={updateFacilityColumns.state()}
                      intent="success"
                    >
                      Update facility columns
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
                              placeholder={`Custom label for ${option.label.toLowerCase()}`}
                              fullWidth
                            />
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </SettingsSection>
              <SettingsSection header="Language and calendar">
                <div class="text-neutral py-2 text-sm">
                  Will add settings for French/English language and
                  Gregorian/Ethiopian calendar
                </div>
              </SettingsSection>
            </div>
          </FrameTop>
        );
      }}
    </StateHolderWrapper>
  );
}
