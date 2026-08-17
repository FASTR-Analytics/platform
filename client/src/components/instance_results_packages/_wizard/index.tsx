import {
  getMergedModuleConfigSelections,
  t3,
  TC,
  type DatasetType,
  type ModuleId,
  type RunGenerationDefaults,
  type RunGenerationModuleOptions,
  type RunGenerationStep1Result,
} from "lib";
import {
  AlertComponentProps,
  Button,
  LoadingIndicator,
  ModalContainer,
  StateHolderFormError,
  StateHolderWrapper,
  StepperChipsWithTitles,
  createFormAction,
  createQuery,
  getStepper,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { getModuleParameterInvalidMsg } from "~/components/_shared/module_parameter_inputs";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import {
  buildModuleGraph,
  familiesOf,
  isOfferable,
} from "./_module_graph";
import { StepConfirm } from "./_step_confirm";
import { StepData } from "./_step_data";
import { StepModules } from "./_step_modules";

type StepKind = "data" | "modules" | "confirm";
const STEPS: StepKind[] = ["data", "modules", "confirm"];

const HEADING = {
  en: "Generate results package",
  fr: "Générer le paquet de résultats",
  pt: "Gerar pacote de resultados",
};

// The results-package LAUNCH wizard: an ephemeral modal (the Upload-CSV
// pattern) — choose data, configure modules, confirm + launch. All state is
// client-local until launch sends the whole configuration in one body;
// nothing persists server-side before that, so abandoning the modal is a
// no-op by construction. Generation is an instance-level act, so the wizard
// has no project context. On launch the run owns its whole lifecycle and
// progress arrives over instance SSE on the Results packages surface.
export function ResultsPackageWizard(
  p: AlertComponentProps<Record<never, never>, undefined>,
) {
  const query = createQuery(
    async () => {
      const [optionsRes, defaultsRes] = await Promise.all([
        serverActions.getRunGenerationModuleOptions({}),
        serverActions.getRunGenerationDefaults({}),
      ]);
      if (optionsRes.success === false) {
        return optionsRes;
      }
      if (defaultsRes.success === false) {
        return defaultsRes;
      }
      return {
        success: true as const,
        data: { options: optionsRes.data, defaults: defaultsRes.data },
      };
    },
    t3({
      en: "Loading module definitions...",
      fr: "Chargement des définitions de modules...",
      pt: "A carregar as definições dos módulos...",
    }),
  );

  return (
    <StateHolderWrapper
      state={query.state()}
      loadingRenderer={(msg) => (
        <ModalContainer width="2xl" title={t3(HEADING)}>
          <LoadingIndicator msg={msg} noPad />
        </ModalContainer>
      )}
      errorRenderer={(err) => (
        <ModalContainer
          width="2xl"
          title={t3(HEADING)}
          rightButtons={
            <Button onClick={() => p.close(undefined)} outline>
              {t3(TC.cancel)}
            </Button>
          }
        >
          <div class="text-danger">{err}</div>
        </ModalContainer>
      )}
    >
      {(keyed) => (
        <WizardInner
          options={keyed.options}
          defaults={keyed.defaults}
          close={p.close}
        />
      )}
    </StateHolderWrapper>
  );
}

type InnerProps = {
  options: RunGenerationModuleOptions;
  defaults: RunGenerationDefaults;
  close: (v: undefined) => void;
};

function WizardInner(p: InnerProps) {
  const graph = buildModuleGraph(p.options);

  // Step 1 — data. Seed: instance defaults, masked by what is uploaded.
  const available = (family: DatasetType): boolean => {
    if (!instanceState.datasetsWithData.includes(family)) {
      return false;
    }
    return family !== "hmis" || instanceState.datasetVersions.hmis !== undefined;
  };
  const [families, setFamilies] = createStore<RunGenerationStep1Result>({
    hmis: p.defaults.step1?.hmis === true && available("hmis"),
    hfa: p.defaults.step1?.hfa === true && available("hfa"),
    iceh: p.defaults.step1?.iceh === true && available("iceh"),
  });

  // Step 2 — modules. `selected` is what the user ticked; `chosen` is what
  // launches: the dependency closure of every ticked module that is
  // offerable against the LIVE families (the user can go back to step 1).
  // Deriving the closure at read time is what keeps the launch payload
  // closed under prerequisites whatever order families and ticks change in
  // — a ticked module whose family is dropped simply falls out (and comes
  // back with the family). Seed: instance defaults. Parameter values:
  // instance defaults beat definition defaults
  // (getMergedModuleConfigSelections).
  const [selected, setSelected] = createStore<Record<string, boolean>>(
    Object.fromEntries(p.defaults.moduleIds.map((id) => [id, true])),
  );
  const [paramValues, setParamValues] = createStore<
    Record<string, Record<string, string>>
  >(
    Object.fromEntries(
      p.options.modules.map((o) => [
        o.id,
        getMergedModuleConfigSelections(
          {
            parameterDefinitions: [],
            parameterSelections: p.defaults.parameterSelections[o.id] ?? {},
          },
          { parameters: o.parameters },
        ).parameterSelections,
      ]),
    ),
  );
  const chosenIds = createMemo((): Set<ModuleId> => {
    const familySet = familiesOf(families);
    const ids = new Set<ModuleId>();
    for (const o of p.options.modules) {
      if (selected[o.id] === true && isOfferable(graph, o.id, familySet)) {
        for (const memberId of graph.closures.get(o.id)!.ids) {
          ids.add(memberId);
        }
      }
    }
    return ids;
  });
  const chosen = createMemo(() =>
    p.options.modules.filter((o) => chosenIds().has(o.id))
  );
  const chosenParamsValid = createMemo(() =>
    chosen().every((o) =>
      o.parameters.every((param) =>
        getModuleParameterInvalidMsg(
          param,
          paramValues[o.id][param.replacementString],
        ) === undefined
      )
    )
  );

  // Step 3 — confirm.
  const [label, setLabel] = createSignal(
    `${t3({
      en: "Results package",
      fr: "Paquet de résultats",
      pt: "Pacote de resultados",
    })} ${new Date().toISOString().slice(0, 10)}`,
  );
  const [attachTargets, setAttachTargets] = createStore<
    Record<string, boolean>
  >({});

  const stepperData = createMemo(() => ({
    dataValid: families.hmis || families.hfa || families.iceh,
    modulesValid: chosen().length > 0 && chosenParamsValid(),
  }));
  const stepper = getStepper(stepperData, {
    initialStep: 0,
    minStep: 0,
    maxStep: STEPS.length - 1,
    getValidation: (step, data) => {
      const kind = STEPS[step];
      if (kind === "data") {
        return { canGoPrev: false, canGoNext: data.dataValid };
      }
      if (kind === "modules") {
        return { canGoPrev: true, canGoNext: data.modulesValid };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });
  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "confirm";
  const stepLabels = [
    t3({ en: "Data", fr: "Données", pt: "Dados" }),
    t3({ en: "Modules", fr: "Modules", pt: "Módulos" }),
    t3({ en: "Confirm and launch", fr: "Confirmer et lancer", pt: "Confirmar e iniciar" }),
  ];

  const launch = createFormAction(
    async () => {
      const trimmed = label().trim();
      if (trimmed === "") {
        return {
          success: false,
          err: t3({
            en: "Enter a label for the results package",
            fr: "Saisissez un libellé pour le paquet de résultats",
            pt: "Introduza um rótulo para o pacote de resultados",
          }),
        };
      }
      const targets = unwrap(attachTargets);
      const values = unwrap(paramValues);
      return await serverActions.launchRunGeneration({
        label: trimmed,
        attachTargetProjectIds: instanceState.projects
          .filter((project) => targets[project.id] === true)
          .map((project) => project.id),
        step1Result: { ...unwrap(families) },
        step2Result: {
          gitRef: p.options.gitRef,
          modules: chosen().map((o) => ({
            moduleId: o.id,
            parameterSelections: { ...values[o.id] },
          })),
        },
      });
    },
    async () => {
      p.close(undefined);
    },
  );

  return (
    <ModalContainer
      width="2xl"
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">{t3(HEADING)}</div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button onClick={stepper.goPrev} outline>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3(TC.cancel)}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={stepper.goNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={launch.click}
              state={launch.state()}
              intent="success"
              iconName="check"
            >
              {t3({
                en: "Launch generation",
                fr: "Lancer la génération",
                pt: "Iniciar a geração",
              })}
            </Button>
          </Show>
        </>
      }
    >
      <div class="min-h-96">
        <Show when={currentStepKind() === "data"}>
          <StepData
            families={families}
            available={available}
            setFamily={setFamilies}
          />
        </Show>
        <Show when={currentStepKind() === "modules"}>
          <StepModules
            options={p.options}
            graph={graph}
            families={families}
            chosenIds={chosenIds()}
            paramValues={paramValues}
            setSelected={setSelected}
            setParam={setParamValues}
          />
        </Show>
        <Show when={currentStepKind() === "confirm"}>
          <StepConfirm
            families={families}
            chosenModuleIds={chosen().map((o) => o.id)}
            label={label()}
            setLabel={setLabel}
            attachTargets={attachTargets}
            setAttachTarget={(id, v) => setAttachTargets(id, v)}
          />
          <StateHolderFormError state={launch.state()} />
        </Show>
      </div>
    </ModalContainer>
  );
}
