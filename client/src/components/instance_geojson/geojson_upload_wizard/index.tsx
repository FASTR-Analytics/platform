import { t3, type Dhis2Credentials } from "lib";
import { Match, Switch, createSignal } from "solid-js";
import { Step0 } from "./step_0";
import { Step1File } from "./step_1_file";
import { Step1Dhis2 } from "./step_1_dhis2";
import { Step2 } from "./step_2";
import { Step3 } from "./step_3";
import { Step4 } from "./step_4";

type Props = {
  close: (p: unknown) => void;
};

export type AnalysisResult = {
  properties: string[];
  sampleValues: Record<string, string[]>;
  featureCount: number;
};

export type Dhis2FeatureContext = {
  uid: string;
  name: string;
  code: string | null;
  parentUid: string | null;
  parentName: string | null;
};

export type Dhis2Level = {
  level: number;
  name: string;
  orgUnitCount: number;
};

export type AdminAreaOption = { value: string; label: string };

export type WizardState = {
  step: () => 0 | 1 | 2 | 3 | 4;
  setStep: (s: 0 | 1 | 2 | 3 | 4) => void;
  source: () => "file" | "dhis2";
  setSource: (s: "file" | "dhis2") => void;
  // File source state
  selectedFileName: () => string;
  setSelectedFileName: (s: string) => void;
  // Shared state (used by both file and DHIS2)
  analysisResult: () => AnalysisResult | undefined;
  setAnalysisResult: (r: AnalysisResult | undefined) => void;
  adminAreaLevel: () => number;
  setAdminAreaLevel: (n: number) => void;
  selectedProp: () => string;
  setSelectedProp: (s: string) => void;
  adminAreaNames: () => string[];
  setAdminAreaNames: (names: string[]) => void;
  adminAreaOptions: () => AdminAreaOption[];
  setAdminAreaOptions: (options: AdminAreaOption[]) => void;
  geoToAdmin: () => Record<string, string>;
  setGeoToAdmin: (mapping: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  // DHIS2 source state
  dhis2Credentials: () => Dhis2Credentials | undefined;
  setDhis2Credentials: (c: Dhis2Credentials | undefined) => void;
  dhis2Levels: () => Dhis2Level[];
  setDhis2Levels: (levels: Dhis2Level[]) => void;
  selectedDhis2Level: () => number | null;
  setSelectedDhis2Level: (level: number | null) => void;
  dhis2Features: () => Dhis2FeatureContext[];
  setDhis2Features: (features: Dhis2FeatureContext[]) => void;
  // Common
  close: (p: unknown) => void;
};

export function GeoJsonUploadWizard(p: Props) {
  const [step, setStep] = createSignal<0 | 1 | 2 | 3 | 4>(0);
  const [source, setSource] = createSignal<"file" | "dhis2">("file");

  // File source state
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");

  // Shared state (used by both file and DHIS2)
  const [analysisResult, setAnalysisResult] = createSignal<AnalysisResult | undefined>(undefined);
  const [adminAreaLevel, setAdminAreaLevel] = createSignal<number>(2);
  const [selectedProp, setSelectedProp] = createSignal<string>("");
  const [adminAreaNames, setAdminAreaNames] = createSignal<string[]>([]);
  const [adminAreaOptions, setAdminAreaOptions] = createSignal<AdminAreaOption[]>([]);
  const [geoToAdmin, setGeoToAdminRaw] = createSignal<Record<string, string>>({});

  // DHIS2 source state
  const [dhis2Credentials, setDhis2Credentials] = createSignal<Dhis2Credentials | undefined>(undefined);
  const [dhis2Levels, setDhis2Levels] = createSignal<Dhis2Level[]>([]);
  const [selectedDhis2Level, setSelectedDhis2Level] = createSignal<number | null>(null);
  const [dhis2Features, setDhis2Features] = createSignal<Dhis2FeatureContext[]>([]);

  function setGeoToAdmin(mapping: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) {
    setGeoToAdminRaw(mapping);
  }

  const state: WizardState = {
    step,
    setStep,
    source,
    setSource,
    selectedFileName,
    setSelectedFileName,
    analysisResult,
    setAnalysisResult,
    adminAreaLevel,
    setAdminAreaLevel,
    selectedProp,
    setSelectedProp,
    adminAreaNames,
    setAdminAreaNames,
    adminAreaOptions,
    setAdminAreaOptions,
    geoToAdmin,
    setGeoToAdmin,
    dhis2Credentials,
    setDhis2Credentials,
    dhis2Levels,
    setDhis2Levels,
    selectedDhis2Level,
    setSelectedDhis2Level,
    dhis2Features,
    setDhis2Features,
    close: p.close,
  };

  return (
    <div class="ui-pad-lg ui-spy" style={{ "min-width": "700px", "max-height": "80vh", "overflow-y": "auto" }}>
      <div class="font-700 text-lg">
        {t3({ en: "Import GeoJSON", fr: "Importer GeoJSON" })}
      </div>

      <Switch>
        <Match when={step() === 0}>
          <Step0 state={state} />
        </Match>
        <Match when={step() === 1 && source() === "file"}>
          <Step1File state={state} />
        </Match>
        <Match when={step() === 1 && source() === "dhis2"}>
          <Step1Dhis2 state={state} />
        </Match>
        <Match when={step() === 2}>
          <Step2 state={state} />
        </Match>
        <Match when={step() === 3}>
          <Step3 state={state} />
        </Match>
        <Match when={step() === 4}>
          <Step4 state={state} />
        </Match>
      </Switch>
    </div>
  );
}
