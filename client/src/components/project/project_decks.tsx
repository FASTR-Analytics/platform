import { InstanceDetail, ProjectDetail, SlideDeckSummary, isFrench, t, t2 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  OpenEditorProps,
  openComponent,
  SparklesIcon,
} from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import { AddDeckForm } from "./add_deck";
import { ProjectAiSlideDeck } from "../project_ai_slide_deck";
import { useProjectDetail } from "~/components/project_runner/mod";

type ExtendedProps = {
  instanceDetail: InstanceDetail;
  isGlobalAdmin: boolean;
  openProjectEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

export function ProjectDecks(p: ExtendedProps) {
  const projectDetail = useProjectDetail();

  async function openDeck(deckId: string, deckLabel: string) {
    await p.openProjectEditor({
      element: ProjectAiSlideDeck,
      props: {
        deckId,
        reportLabel: deckLabel,
        projectDetail,
        instanceDetail: p.instanceDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });
  }

  const [searchText, setSearchText] = createSignal<string>("");
  const [deckListing, setDeckListing] = createSignal<SlideDeckSummary[]>(
    projectDetail.slideDecks,
  );

  createEffect(() => {
    updateDeckListing(searchText());
  });

  async function updateDeckListing(searchText: string) {
    await new Promise((res) => setTimeout(res, 0));
    const searchTextLowerCase = searchText.toLowerCase();
    const newDecks =
      searchText.length >= 3
        ? projectDetail.slideDecks.filter((deck) =>
          deck.label.toLowerCase().includes(searchTextLowerCase),
        )
        : projectDetail.slideDecks;
    setDeckListing(newDecks);
  }

  async function attemptAddDeck() {
    const res = await openComponent({
      element: AddDeckForm,
      props: {
        projectId: projectDetail.id,
      },
    });
    if (res === undefined) {
      return;
    }
    const deck = projectDetail.slideDecks.find(d => d.id === res.newDeckId);
    await openDeck(res.newDeckId, deck?.label || "Slide Deck");
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading="Slide decks"
          searchText={searchText()}
          setSearchText={setSearchText}
          french={isFrench()}
          class="border-base-300"
        >
          <Show
            when={
              !projectDetail.isLocked &&
              projectDetail.projectModules.length > 0
            }
          >
            <Button onClick={attemptAddDeck} iconName="plus">
              New slide deck
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <Show
        when={projectDetail.projectModules.length > 0}
        fallback={
          <div class="ui-pad text-neutral text-sm">
            {t("You need to enable at least one module to create slide decks")}
          </div>
        }
      >
        <div class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start">
          <For
            each={deckListing()}
            fallback={
              <div class="text-neutral text-sm">
                {searchText().length >= 3
                  ? "No matching decks"
                  : "No slide decks yet"}
              </div>
            }
          >
            {(deck) => {
              return (
                <div
                  class="ui-pad ui-hoverable border-base-300 min-h-[150px] rounded border"
                  onClick={() => openDeck(deck.id, deck.label)}
                >
                  <div class="ui-spy-sm col-span-1">
                    <div class="font-700">{deck.label}</div>
                    <div class="text-sm flex items-center gap-2">
                      <span class="h-[1em] w-[1em]">
                        <SparklesIcon />
                      </span>
                      AI Slide Deck
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </FrameTop>
  );
}
