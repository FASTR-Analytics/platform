// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Button, createSignal, For, Show, t3 } from "../../deps.ts";
import type { ProposalPreview } from "../../_core/tool_helpers.ts";
import type { DisplayItem } from "../../_core/types.ts";
import { md } from "./_markdown_utils.ts";

// Shared preview body: the inline card and the modal path render the SAME
// structured preview (changes as a before → after list, diff as a two-pane
// block, description through markdown) — a plain-text projection would
// faithfully port the consumers' collapsed-paragraph defect this replaces.
export function ProposalPreviewBody(p: { preview: ProposalPreview }) {
  return (
    <div class="ui-spy-sm">
      <Show when={p.preview.description}>
        {(description) => (
          <div class="text-sm" innerHTML={md.render(description())} />
        )}
      </Show>
      <Show when={(p.preview.changes?.length ?? 0) > 0}>
        <div class="space-y-1">
          <For each={p.preview.changes}>
            {(change) => (
              <div class="flex flex-wrap items-baseline gap-1 text-xs">
                <span class="font-700">{change.label}</span>
                <Show when={change.before !== undefined}>
                  <span class="bg-danger-subtle text-danger-subtle-content rounded px-1 line-through">
                    {change.before}
                  </span>
                </Show>
                <Show
                  when={change.before !== undefined &&
                    change.after !== undefined}
                >
                  <span>→</span>
                </Show>
                <Show when={change.after !== undefined}>
                  <span class="bg-success-subtle text-success-subtle-content rounded px-1">
                    {change.after}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={p.preview.diff} keyed>
        {(diff) => (
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-base-content-muted mb-1 text-xs font-700">
                {t3({ en: "Before", fr: "Avant", pt: "Antes" })}
              </div>
              <div class="bg-base-200 whitespace-pre-wrap rounded p-2 font-mono text-xs">
                {diff.before}
              </div>
            </div>
            <div>
              <div class="text-base-content-muted mb-1 text-xs font-700">
                {t3({ en: "After", fr: "Après", pt: "Depois" })}
              </div>
              <div class="bg-base-200 whitespace-pre-wrap rounded p-2 font-mono text-xs">
                {diff.after}
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

// The inline pending card. A pure view over the display item + the
// store-owned decision: onDecide resolves the conversation's
// pendingDecision (idempotent — a no-op once resolved), so unmounting and
// remounting the pane keeps the decision fully workable. No onCleanup
// cancel — only explicit paths resolve a decision (decision log #6).
export function ApprovalPendingRenderer(p: {
  item: Extract<DisplayItem, { type: "approval_pending" }>;
  onDecide: (accepted: boolean, alwaysThisSession?: boolean) => void;
}) {
  const [always, setAlways] = createSignal(false);
  const [decided, setDecided] = createSignal(false);

  const decide = (accepted: boolean) => {
    if (decided()) return;
    setDecided(true);
    p.onDecide(accepted, always());
  };

  return (
    <div class="rounded border p-3" data-ai-approval-card={p.item.toolName}>
      <div
        classList={{
          "font-700 mb-2 text-sm": true,
          "text-danger": p.item.preview.intent === "danger",
        }}
      >
        {p.item.preview.title}
      </div>
      <ProposalPreviewBody preview={p.item.preview} />
      <Show when={p.item.sessionCheckbox}>
        <label class="mt-3 flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={always()}
            onChange={(evt) =>
              setAlways(evt.currentTarget.checked)}
          />
          {t3({
            en: "Don't ask again in this conversation",
            fr: "Ne plus demander dans cette conversation",
            pt: "Não perguntar novamente nesta conversa",
          })}
        </label>
      </Show>
      {
        /* Accept renders before Decline by contract — the debug/live rigs
          target the card's buttons positionally (Button has no data-*
          passthrough). */
      }
      <div class="mt-3 flex items-center gap-3" data-ai-approval-actions>
        <Button
          intent={p.item.preview.intent === "danger" ? "danger" : "primary"}
          disabled={decided()}
          onClick={() =>
            decide(true)}
        >
          {p.item.preview.confirmLabel ??
            t3({ en: "Accept", fr: "Accepter", pt: "Aceitar" })}
        </Button>
        <Button
          intent="neutral"
          disabled={decided()}
          onClick={() => decide(false)}
        >
          {t3({ en: "Decline", fr: "Refuser", pt: "Recusar" })}
        </Button>
      </div>
    </div>
  );
}

function decisionLabel(
  decision: Extract<
    DisplayItem,
    { type: "approval_decision" }
  >["decision"],
): string {
  switch (decision) {
    case "approved":
      return t3({ en: "Approved", fr: "Approuvé", pt: "Aprovado" });
    case "declined":
      return t3({ en: "Declined", fr: "Refusé", pt: "Recusado" });
    case "auto_approved":
      return t3({
        en: "Auto-approved",
        fr: "Approuvé automatiquement",
        pt: "Aprovado automaticamente",
      });
    case "auto_declined":
      return t3({
        en: "Not applied",
        fr: "Non appliqué",
        pt: "Não aplicado",
      });
  }
}

// The persisted decision record — a quiet timeline line.
export function ApprovalDecisionRenderer(p: {
  item: Extract<DisplayItem, { type: "approval_decision" }>;
}) {
  return (
    <div
      class="text-base-content-muted my-1 text-sm italic"
      data-ai-approval-decision={p.item.decision}
    >
      {decisionLabel(p.item.decision)}: {p.item.title}
    </div>
  );
}
