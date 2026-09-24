import { t3 } from "lib";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { canEditProduct } from "~/state/instance/product_access";

// A product's name in an editor header, renamed in place: click it, type,
// Enter or a click elsewhere saves, Escape puts it back (Google Docs). The
// write is the same `updateProductLabel` the settings modal makes; the label
// shown is the LIVE T1 one, so the SSE echo (and a collaborator's rename)
// lands here without a remount.
export function ProductTitle(p: { productId: string; label: string }) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let input: HTMLInputElement | undefined;

  function start() {
    if (!canEditProduct(p.productId) || saving()) return;
    setDraft(p.label);
    setEditing(true);
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  }

  async function commit() {
    if (!editing()) return;
    const label = draft().trim();
    setEditing(false);
    if (label.length === 0 || label === p.label) return;
    setSaving(true);
    await serverActions.updateProductLabel({ product_id: p.productId, label });
    setSaving(false);
  }

  return (
    <Show
      when={editing()}
      fallback={
        <div
          class="ui-text-title min-w-0 truncate"
          classList={{
            "cursor-text rounded px-1 -mx-1 hover:bg-base-200": canEditProduct(p.productId),
          }}
          title={canEditProduct(p.productId)
            ? t3({ en: "Click to rename", fr: "Cliquer pour renommer", pt: "Clique para mudar o nome" })
            : undefined}
          onClick={start}
        >
          {p.label}
        </div>
      }
    >
      <input
        ref={input}
        class="ui-text-title border-primary min-w-0 rounded border-b bg-transparent px-1 -mx-1 outline-none"
        style={{ width: `${Math.max(8, draft().length + 2)}ch`, "max-width": "40rem" }}
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    </Show>
  );
}
