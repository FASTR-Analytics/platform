import { useNavigate } from "@solidjs/router";
import type { AiContentSlideInput, DisaggregationOption, SlideDeckSummary } from "lib";
import { AlertComponentProps, AlertFormHolder, Button, Input, Loading, RadioGroup, timActionForm, type SelectOption } from "panther";
import { createSignal, Show, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { convertAiInputToSlide } from "../project_ai_slide_deck/utils/convert_ai_input_to_slide";
import { InlineReplicantSelector } from "../report/inline_replicant_selector";

type Props = {
  projectId: string;
  visualizationId: string;
  visualizationLabel: string;
  replicateBy: DisaggregationOption | undefined;
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

      if (p.replicateBy && !selectedReplicant()) {
        return { success: false as const, err: "Please select a replicant" };
      }

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

      const input: AiContentSlideInput = {
        type: "content",
        heading: p.visualizationLabel,
        blocks: [{
          type: "from_visualization",
          visualizationId: p.visualizationId,
          replicant: p.replicateBy ? selectedReplicant() : undefined,
        }],
      };

      const slide = await convertAiInputToSlide(p.projectId, input);

      const addRes = await serverActions.createSlide({
        projectId: p.projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide,
      });

      if (!addRes.success) {
        return addRes;
      }

      return { success: true as const, data: { deckId } };
    },
    (data) => {
      p.close(data);
      navigate(`/?p=${p.projectId}&d=${data.deckId}`);
    }
  );

  return (
    <AlertFormHolder
      formId="create-slide-from-viz"
      header="Create Slide"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={isCreatingNew() ? !newDeckLabel().trim() : !selectedDeckId()}
    >
      <Show when={isLoadingDecks()}>
        <div class="py-2 flex justify-center">
          <Loading msg="Loading decks..." noPad />
        </div>
      </Show>

      <Show when={!isLoadingDecks()}>
        <div class="ui-spy">
          <Show when={p.replicateBy}>
            {(replicateBy) => (
              <InlineReplicantSelector
                projectId={p.projectId}
                presentationObjectId={p.visualizationId}
                replicateBy={replicateBy()}
                selectedValue={selectedReplicant()}
                onChange={setSelectedReplicant}
              />
            )}
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
