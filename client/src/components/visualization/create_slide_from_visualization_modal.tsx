import { useNavigate } from "@solidjs/router";
import type { AiContentSlideInput, DisaggregationOption, MetricWithStatus, SlideDeckSummary } from "lib";
import { t } from "lib";
import { AlertComponentProps, AlertFormHolder, Button, Input, Loading, RadioGroup, timActionForm, type SelectOption, ProgressBar, getProgress } from "panther";
import { createSignal, Show, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { convertAiInputToSlide } from "../slide_deck/utils/convert_ai_input_to_slide";
import { InlineReplicantSelector } from "../report/inline_replicant_selector";

type Props = {
  projectId: string;
  visualizationIds: string[];
  visualizationLabels: string[];
  replicateBy?: DisaggregationOption;
  metrics: MetricWithStatus[];
};

type ReturnType = { deckId: string } | undefined;

export function CreateSlideFromVisualizationModal(p: AlertComponentProps<Props, ReturnType>) {
  const navigate = useNavigate();
  const [decks, setDecks] = createSignal<SlideDeckSummary[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = createSignal(true);
  const [selectedDeckId, setSelectedDeckId] = createSignal<string>("");
  const [isCreatingNew, setIsCreatingNew] = createSignal(false);
  const [newDeckLabel, setNewDeckLabel] = createSignal("");
  const [selectedReplicant, setSelectedReplicant] = createSignal<string>("");
  const [creationMode, setCreationMode] = createSignal<"single" | "all">("single");
  const [replicantOptions, setReplicantOptions] = createSignal<string[]>([]);
  const progress = getProgress();

  const isSingleReplicatedMode = () =>
    p.visualizationIds.length === 1 && p.replicateBy !== undefined;

  const isBatchMode = () => !isSingleReplicatedMode();

  const radioOptions = (): SelectOption<string>[] =>
    decks().map(d => ({ value: d.id, label: d.label }));

  onMount(async () => {
    const res = await serverActions.getAllSlideDecks({ projectId: p.projectId });
    if (res.success) {
      setDecks(res.data);
      if (res.data.length > 0) {
        setSelectedDeckId(res.data[0].id);
      }
    }
    setIsLoadingDecks(false);
  });

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();

      let deckId: string;

      if (isCreatingNew()) {
        const label = newDeckLabel().trim();
        if (!label) {
          return { success: false as const, err: "Please enter a deck name" };
        }
        const createRes = await serverActions.createSlideDeck({
          projectId: p.projectId,
          label,
        });
        if (!createRes.success) {
          return createRes;
        }
        deckId = createRes.data.deckId;
      } else {
        deckId = selectedDeckId();
      }

      // SINGLE REPLICATED MODE: Existing behavior preserved
      if (isSingleReplicatedMode()) {
        if (creationMode() === "single") {
          if (!selectedReplicant()) {
            return { success: false as const, err: "Please select a replicant" };
          }

          const input: AiContentSlideInput = {
            type: "content",
            header: p.visualizationLabels[0],
            blocks: [{
              type: "from_visualization",
              visualizationId: p.visualizationIds[0],
              replicant: selectedReplicant(),
            }],
          };

          const slide = await convertAiInputToSlide(p.projectId, input, p.metrics);
          const addRes = await serverActions.createSlide({
            projectId: p.projectId,
            deck_id: deckId,
            position: { toEnd: true },
            slide,
          });

          if (!addRes.success) return addRes;
          return { success: true as const, data: { deckId } };
        } else {
          // All replicants mode (existing)
          const options = replicantOptions();
          let successCount = 0;

          for (let i = 0; i < options.length; i++) {
            const replicantValue = options[i];
            const replicantLabel = p.replicateBy === "indicator_common_id"
              ? t(replicantValue).toUpperCase()
              : replicantValue;

            progress.onProgress(
              i / options.length,
              `Creating slide ${i + 1} of ${options.length}...`
            );

            const input: AiContentSlideInput = {
              type: "content",
              header: `${p.visualizationLabels[0]} - ${replicantLabel}`,
              blocks: [{
                type: "from_visualization",
                visualizationId: p.visualizationIds[0],
                replicant: replicantValue,
              }],
            };

            try {
              const slide = await convertAiInputToSlide(p.projectId, input, p.metrics);
              const addRes = await serverActions.createSlide({
                projectId: p.projectId,
                deck_id: deckId,
                position: { toEnd: true },
                slide,
              });

              if (!addRes.success) {
                return {
                  success: false as const,
                  err: `Failed on slide ${i + 1} of ${options.length} (${replicantLabel}): ${addRes.err}. Created ${successCount} slides successfully.`
                };
              }
              successCount++;
            } catch (err) {
              return {
                success: false as const,
                err: `Failed on slide ${i + 1} of ${options.length} (${replicantLabel}): ${err instanceof Error ? err.message : String(err)}. Created ${successCount} slides successfully.`
              };
            }
          }

          progress.onProgress(1, `Created ${options.length} slides`);
          return { success: true as const, data: { deckId } };
        }
      }

      // BATCH MODE: Single non-replicated OR multiple non-replicated
      const vizCount = p.visualizationIds.length;
      let successCount = 0;

      for (let i = 0; i < vizCount; i++) {
        const vizId = p.visualizationIds[i];
        const vizLabel = p.visualizationLabels[i];

        if (vizCount > 1) {
          progress.onProgress(
            i / vizCount,
            `Creating slide ${i + 1} of ${vizCount}...`
          );
        }

        const input: AiContentSlideInput = {
          type: "content",
          header: vizLabel,
          blocks: [{
            type: "from_visualization",
            visualizationId: vizId,
            replicant: undefined,
          }],
        };

        try {
          const slide = await convertAiInputToSlide(p.projectId, input, p.metrics);
          const addRes = await serverActions.createSlide({
            projectId: p.projectId,
            deck_id: deckId,
            position: { toEnd: true },
            slide,
          });

          if (!addRes.success) {
            return {
              success: false as const,
              err: vizCount > 1
                ? `Failed on slide ${i + 1} of ${vizCount} (${vizLabel}): ${addRes.err}. Created ${successCount} slides successfully.`
                : addRes.err
            };
          }
          successCount++;
        } catch (err) {
          return {
            success: false as const,
            err: vizCount > 1
              ? `Failed on slide ${i + 1} of ${vizCount} (${vizLabel}): ${err instanceof Error ? err.message : String(err)}. Created ${successCount} slides successfully.`
              : (err instanceof Error ? err.message : String(err))
          };
        }
      }

      if (vizCount > 1) {
        progress.onProgress(1, `Created ${vizCount} slides`);
      }

      return { success: true as const, data: { deckId } }
    },
    (data) => {
      p.close(data);
      navigate(`/?p=${p.projectId}&d=${data.deckId}`);
    }
  );

  const header = p.visualizationIds.length > 1
    ? `Create ${p.visualizationIds.length} slides`
    : "Create Slide";

  return (
    <AlertFormHolder
      formId="create-slide-from-viz"
      header={header}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={
        isCreatingNew()
          ? !newDeckLabel().trim()
          : !selectedDeckId() ||
          (isSingleReplicatedMode() && creationMode() === "single" && !selectedReplicant())
      }
    >
      <Show when={isLoadingDecks()}>
        <div class="py-2 flex justify-center">
          <Loading msg="Loading decks..." noPad />
        </div>
      </Show>

      <Show when={!isLoadingDecks()}>
        <div class="ui-spy">
          <Show when={isSingleReplicatedMode() ? p.replicateBy : false}>
            {(replicateBy) => (
              <>
                <RadioGroup
                  label="Create slides for"
                  value={creationMode()}
                  options={[
                    { value: "single", label: "Selected replicant" },
                    { value: "all", label: `All replicants (${replicantOptions().length})` }
                  ]}
                  onChange={(v) => setCreationMode(v as "single" | "all")}
                />

                <Show when={creationMode() === "single"}>
                  <InlineReplicantSelector
                    projectId={p.projectId}
                    presentationObjectId={p.visualizationIds[0]}
                    replicateBy={replicateBy()}
                    selectedValue={selectedReplicant()}
                    onChange={(value, allOptions) => {
                      setSelectedReplicant(value);
                      if (allOptions) {
                        setReplicantOptions(allOptions);
                      }
                    }}
                  />
                </Show>

                <Show when={save.state().status === "loading"}>
                  <ProgressBar
                    progressFrom0To100={progress.progressFrom0To100()}
                    progressMsg={progress.progressMsg()}
                    small
                  />
                </Show>
              </>
            )}
          </Show>
          <Show when={isBatchMode() && save.state().status === "loading" && p.visualizationIds.length > 1}>
            <ProgressBar
              progressFrom0To100={progress.progressFrom0To100()}
              progressMsg={progress.progressMsg()}
              small
            />
          </Show>
          <Show
            when={!isCreatingNew()}
            fallback={
              <div class="space-y-4">
                <Input
                  label="New deck name"
                  value={newDeckLabel()}
                  onChange={setNewDeckLabel}
                  placeholder="Deck name..."
                  autoFocus
                  fullWidth
                />
                <Button
                  size="sm"
                  outline
                  onClick={() => setIsCreatingNew(false)}
                >
                  Back to deck list
                </Button>
              </div>
            }
          >
            <div class="space-y-4">
              <RadioGroup
                label="Slide deck"
                value={selectedDeckId()}
                options={radioOptions()}
                onChange={setSelectedDeckId}
                convertToSelectThreshold={6}
                fullWidthForSelect
              />
              <Button
                size="sm"
                outline
                iconName="plus"
                onClick={() => setIsCreatingNew(true)}
              >
                Create new deck
              </Button>
            </div>
          </Show>
        </div>
      </Show>
    </AlertFormHolder>
  );
}
