import type { SlideDeckSummary, Slide } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Button,
  Input,
  Loading,
  RadioGroup,
  timActionForm,
  type SelectOption,
} from "panther";
import { createSignal, Show, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  projectId: string;
  slide: Slide;
};

type ReturnType = { deckId: string } | undefined;

export function AddToDeckModal(p: AlertComponentProps<Props, ReturnType>) {
  const [decks, setDecks] = createSignal<SlideDeckSummary[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = createSignal(true);
  const [selectedDeckId, setSelectedDeckId] = createSignal<string>("");
  const [isCreatingNew, setIsCreatingNew] = createSignal(false);
  const [newDeckLabel, setNewDeckLabel] = createSignal("");

  const radioOptions = (): SelectOption<string>[] =>
    decks().map((d) => ({ value: d.id, label: d.label }));

  onMount(async () => {
    const res = await serverActions.getAllSlideDecks({
      projectId: p.projectId,
    });
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

      const addRes = await serverActions.createSlide({
        projectId: p.projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide: p.slide,
      });

      if (!addRes.success) {
        return addRes;
      }

      return { success: true as const, data: { deckId } };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="add-to-deck"
      header="Add to Slide Deck"
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      disableSaveButton={
        isCreatingNew() ? !newDeckLabel().trim() : !selectedDeckId()
      }
    >
      <Show when={isLoadingDecks()}>
        <div class="flex justify-center py-2">
          <Loading msg="Loading decks..." noPad />
        </div>
      </Show>

      <Show when={!isLoadingDecks()}>
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
      </Show>
    </AlertFormHolder>
  );
}
