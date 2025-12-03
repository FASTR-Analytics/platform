// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import MarkdownIt from "markdown-it";
import { createSignal, Show } from "solid-js";
import { MarkdownPresentation } from "../content/markdown_presentation.tsx";
import { type APIResponseWithData, timQuery } from "../deps.ts";
import { Button } from "../form_inputs/button.tsx";
import { FrameBottom } from "../layout/frames.tsx";
import { Select, Slider } from "../mod.ts";
import { StateHolderWrapper } from "../special_state/state_holder_wrapper.tsx";
import { PrintSlides } from "./print_slides.tsx";

const md = new MarkdownIt();

type Props = {
  url: string;
  scale?: number;
  leftAlignMath?: boolean;
};

export function PresentationViewer(p: Props) {
  const contentQuery = timQuery(() => fetchMarkdown(p.url));

  return (
    <StateHolderWrapper state={contentQuery.state()}>
      {(keyedMarkdownContent) => (
        <PresentationViewerContent
          markdownContent={keyedMarkdownContent}
          scale={p.scale}
          leftAlignMath={p.leftAlignMath}
        />
      )}
    </StateHolderWrapper>
  );
}

async function fetchMarkdown(
  url: string,
): Promise<APIResponseWithData<string>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false as const,
        err: `Failed to fetch markdown: ${response.statusText}`,
      } as const;
    }

    const data = await response.text();
    return { success: true as const, data } as const;
  } catch (err) {
    return {
      success: false as const,
      err: err instanceof Error ? err.message : String(err),
    } as const;
  }
}

type ContentProps = {
  markdownContent: string;
  scale?: number;
  leftAlignMath?: boolean;
};

function PresentationViewerContent(p: ContentProps) {
  const slides = () => {
    const trimmed = p.markdownContent.trim();
    if (!trimmed) {
      return [];
    }

    const tokens = md.parse(trimmed, {});
    const hrLineNumbers: number[] = [];

    for (const token of tokens) {
      if (token.type === "hr" && token.map) {
        hrLineNumbers.push(token.map[0]);
      }
    }

    if (hrLineNumbers.length === 0) {
      return [trimmed];
    }

    const lines = trimmed.split("\n");
    const slides: string[] = [];
    let currentStart = 0;

    for (const hrLine of hrLineNumbers) {
      const slideContent = lines.slice(currentStart, hrLine).join("\n").trim();
      if (slideContent) {
        slides.push(slideContent);
      }
      currentStart = hrLine + 1;
    }

    const lastSlide = lines.slice(currentStart).join("\n").trim();
    if (lastSlide) {
      slides.push(lastSlide);
    }

    return slides;
  };

  const slideOptions = () => {
    return slides().map((slide, idx) => {
      const tokens = md.parse(slide, {});
      let headerText = "";

      for (const token of tokens) {
        if (token.type === "heading_open") {
          const contentToken = tokens[tokens.indexOf(token) + 1];
          if (contentToken?.type === "inline" && contentToken.content) {
            headerText = contentToken.content;
            break;
          }
        }
      }

      const label = headerText
        ? `${idx + 1}. ${headerText.slice(0, 50)}${
          headerText.length > 50 ? "..." : ""
        }`
        : `Slide ${idx + 1}`;

      return { value: idx.toString(), label };
    });
  };

  const [currentSlideIndex, setCurrentSlideIndex] = createSignal(0);
  const [scale, setScale] = createSignal(p.scale ?? 1.5);
  const [isPrinting, setIsPrinting] = createSignal(false);

  const currentSlide = () => slides()[currentSlideIndex()];
  const totalSlides = () => slides().length;
  const hasNext = () => currentSlideIndex() < totalSlides() - 1;
  const hasPrevious = () => currentSlideIndex() > 0;

  const handlePrint = () => {
    setIsPrinting(true);
  };

  const handlePrintComplete = () => {
    setIsPrinting(false);
  };

  const goToNext = () => {
    if (hasNext()) {
      setCurrentSlideIndex((prev) => prev + 1);
    }
  };

  const goToPrevious = () => {
    if (hasPrevious()) {
      setCurrentSlideIndex((prev) => prev - 1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      goToNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPrevious();
    }
  };

  return (
    <>
      <div class="no-print h-full" onKeyDown={handleKeyDown} tabIndex={0}>
        <Show
          when={currentSlide()}
          fallback={
            <div class="ui-pad text-neutral flex h-full items-center justify-center">
              No slides available
            </div>
          }
        >
          <FrameBottom
            panelChildren={
              <div class="ui-pad border-base-300 bg-base-100 ui-gap flex select-none items-center justify-end border-t">
                <div class="ui-gap flex items-center">
                  <div class="text-neutral text-sm">
                    Slide {currentSlideIndex() + 1} of {totalSlides()}
                  </div>
                  <div class="min-w-[200px]">
                    <Select
                      value={currentSlideIndex().toString()}
                      onChange={(val) => setCurrentSlideIndex(parseInt(val))}
                      options={slideOptions()}
                    />
                  </div>
                </div>

                <div class="ui-gap flex items-center">
                  <div class="">
                    <Slider
                      // label="Scale"
                      value={scale()}
                      onChange={setScale}
                      min={1}
                      step={0.1}
                      max={4}
                      fullWidth
                      // ticks={{
                      //   major: 4,
                      //   showLabels: true,
                      // }}
                    />
                  </div>
                  <div class="ui-gap-sm flex items-center">
                    <Button
                      onClick={handlePrint}
                      intent="base-100"
                      iconName="print"
                    >
                    </Button>
                    <Button
                      onClick={goToPrevious}
                      disabled={!hasPrevious()}
                      iconName="chevronLeft"
                      intent="base-100"
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={goToNext}
                      disabled={!hasNext()}
                      iconName="chevronRight"
                      intent="base-100"
                      iconPosition="right"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            }
          >
            <div class="ui-pad-lg">
              <MarkdownPresentation
                markdown={currentSlide()!}
                scale={scale()}
                leftAlignMath={p.leftAlignMath}
              />
            </div>
          </FrameBottom>
        </Show>
      </div>
      <Show when={isPrinting()}>
        <PrintSlides
          slides={slides()}
          scale={scale() * 0.75}
          leftAlignMath={p.leftAlignMath}
          onComplete={handlePrintComplete}
        />
      </Show>
    </>
  );
}
