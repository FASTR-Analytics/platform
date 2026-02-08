import type { SlideDeckFolder, SlideDeckSummary } from "lib";
import { Button, Input, RadioGroup, Select, type SelectOption } from "panther";
import { createMemo, createSignal, Show } from "solid-js";

type Props = {
  decks: SlideDeckSummary[];
  folders: SlideDeckFolder[];
  selectedDeckId: string;
  onSelectDeck: (deckId: string) => void;
  isCreatingNew: boolean;
  onSetCreatingNew: (v: boolean) => void;
  newDeckLabel: string;
  onSetNewDeckLabel: (v: string) => void;
};

export function DeckSelector(p: Props) {
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>("_all");

  const folderOptions = createMemo((): SelectOption<string>[] => {
    if (p.folders.length === 0) return [];
    return [
      { value: "_all", label: "All folders" },
      { value: "_unfiled", label: "General" },
      ...p.folders.map((f) => ({ value: f.id, label: f.label })),
    ];
  });

  const filteredDecks = createMemo((): SelectOption<string>[] => {
    const fId = selectedFolderId();
    const filtered =
      fId === "_all"
        ? p.decks
        : fId === "_unfiled"
          ? p.decks.filter((d) => d.folderId === null)
          : p.decks.filter((d) => d.folderId === fId);
    return filtered.map((d) => ({ value: d.id, label: d.label }));
  });

  return (
    <Show
      when={!p.isCreatingNew}
      fallback={
        <div class="ui-spy">
          <Input
            label="New deck name"
            value={p.newDeckLabel}
            onChange={p.onSetNewDeckLabel}
            placeholder="Deck name..."
            autoFocus
            fullWidth
          />
          <Button
            size="sm"
            outline
            onClick={() => p.onSetCreatingNew(false)}
          >
            Back to deck list
          </Button>
        </div>
      }
    >
      <div class="ui-spy-sm">
        <Show when={folderOptions().length > 0}>
          <Select
            label="Slide deck folder"
            value={selectedFolderId()}
            options={folderOptions()}
            onChange={setSelectedFolderId}
            fullWidth
          />
        </Show>
        <RadioGroup
          label="Slide deck"
          value={p.selectedDeckId}
          options={filteredDecks()}
          onChange={p.onSelectDeck}
          convertToSelectThreshold={6}
          fullWidthForSelect
        />
        <Button
          size="sm"
          outline
          iconName="plus"
          onClick={() => p.onSetCreatingNew(true)}
        >
          Create new deck
        </Button>
      </div>
    </Show>
  );
}
