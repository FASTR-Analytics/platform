// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, onCleanup, Show } from "solid-js";

export type TooltipPosition = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: string;
  position?: TooltipPosition;
  children: JSX.Element;
  disabled?: boolean;
};

export function Tooltip(props: TooltipProps): JSX.Element {
  const [isVisible, setIsVisible] = createSignal(false);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  let wrapperRef: HTMLDivElement | undefined;
  const tooltipPosition = props.position ?? "right";

  function updatePosition() {
    if (!wrapperRef) return;
    const rect = wrapperRef.getBoundingClientRect();

    let x = 0;
    let y = 0;

    switch (tooltipPosition) {
      case "right":
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
        break;
      case "left":
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
        break;
      case "top":
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
        break;
      case "bottom":
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
        break;
    }

    setPosition({ x, y });
  }

  function handleMouseEnter() {
    if (props.disabled) return;
    updatePosition();
    setIsVisible(true);
  }

  function handleMouseLeave() {
    setIsVisible(false);
  }

  onCleanup(() => {
    setIsVisible(false);
  });

  const getTransformOrigin = () => {
    switch (tooltipPosition) {
      case "right":
        return "left center";
      case "left":
        return "right center";
      case "top":
        return "center bottom";
      case "bottom":
        return "center top";
      default:
        return "left center";
    }
  };

  const getTransform = () => {
    switch (tooltipPosition) {
      case "right":
        return "translateY(-50%)";
      case "left":
        return "translate(-100%, -50%)";
      case "top":
        return "translate(-50%, -100%)";
      case "bottom":
        return "translateX(-50%)";
      default:
        return "translateY(-50%)";
    }
  };

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {props.children}
      <Show when={isVisible()}>
        <div
          class="bg-base-content text-base-100 fixed z-50 whitespace-nowrap rounded px-2 py-1 text-sm shadow-lg"
          style={
            {
              left: `${position().x}px`,
              top: `${position().y}px`,
              transform: getTransform(),
              "transform-origin": getTransformOrigin(),
              "pointer-events": "none",
            } as JSX.CSSProperties
          }
        >
          {props.content}
        </div>
      </Show>
    </div>
  );
}
