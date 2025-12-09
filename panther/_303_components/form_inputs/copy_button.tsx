// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, onCleanup } from "solid-js";
import type { Intent } from "../types.ts";
import { Button } from "./button.tsx";

const FEEDBACK_DURATION_MS = 2000;

type CopySource =
  | { text: string }
  | { getText: () => string | Promise<string> }
  | { selector: string }
  | { element: HTMLElement };

type CopyToClipboardButtonProps = CopySource & {
  children?: string;
  intent?: Intent;
  outline?: boolean;
  fullWidth?: boolean;
  size?: "sm";
  disabled?: boolean;
  ariaLabel?: string;
};

async function getTextFromSource(source: CopySource): Promise<string> {
  if ("text" in source) {
    return source.text;
  }
  if ("getText" in source) {
    const result = source.getText();
    return result instanceof Promise ? await result : result;
  }
  if ("selector" in source) {
    const el = document.querySelector(source.selector);
    if (!el) return "";
    return getTextContentFromElement(el as HTMLElement);
  }
  if ("element" in source) {
    return getTextContentFromElement(source.element);
  }
  return "";
}

function getTextContentFromElement(el: HTMLElement): string {
  // For input/textarea elements, use value
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  // For contenteditable elements, use innerText
  if (el.isContentEditable) {
    return el.innerText;
  }
  // For pre/code elements, preserve whitespace formatting
  if (el instanceof HTMLPreElement || el.tagName === "CODE") {
    return el.innerText;
  }
  // Default: use innerText which respects CSS visibility and collapses whitespace appropriately
  return el.innerText;
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Modern Clipboard API (preferred)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for older browsers or when Clipboard API is unavailable
  // (e.g., non-HTTPS contexts, iframe restrictions)
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Prevent scrolling to bottom of page
    textarea.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;box-shadow:none;background:transparent;";
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    document.body.appendChild(textarea);

    // Handle iOS Safari
    const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      const range = document.createRange();
      range.selectNodeContents(textarea);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      textarea.setSelectionRange(0, text.length);
    } else {
      textarea.select();
    }

    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

export function CopyToClipboardButton(p: CopyToClipboardButtonProps) {
  const [showSuccess, setShowSuccess] = createSignal(false);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });

  async function handleClick() {
    // Clear any existing timeout to handle rapid clicks
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    const source: CopySource = "text" in p
      ? { text: p.text }
      : "getText" in p
      ? { getText: p.getText }
      : "selector" in p
      ? { selector: p.selector }
      : { element: p.element };

    const text = await getTextFromSource(source);
    const success = await copyToClipboard(text);

    if (success) {
      setShowSuccess(true);
      timeoutId = setTimeout(() => {
        setShowSuccess(false);
        timeoutId = undefined;
      }, FEEDBACK_DURATION_MS);
    }
  }

  return (
    <Button
      onClick={handleClick}
      intent={p.intent}
      outline={p.outline}
      fullWidth={p.fullWidth}
      size={p.size}
      disabled={p.disabled}
      iconName={showSuccess() ? "check" : "copy"}
      ariaLabel={p.ariaLabel ?? "Copy to clipboard"}
    >
      {p.children}
    </Button>
  );
}
