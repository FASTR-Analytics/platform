import { createSignal, For, onMount, Show, Switch, Match } from "solid-js";
import { Button, IconRenderer, Input, ModalContainer } from "panther";
import type { AlertComponentProps } from "panther";
import type { PresentationObjectSummary, ShareTokenInfo } from "lib";
import { _SERVER_HOST } from "~/server_actions";

type Props = {
  visualizations: PresentationObjectSummary[];
};

type AllShareToken = ShareTokenInfo & { resourceId: string };

function sanitizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
}

export function AllShareLinksModal(p: AlertComponentProps<Props, void>) {
  const [tokens, setTokens] = createSignal<AllShareToken[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);
  const [editing, setEditing] = createSignal<AllShareToken | null>(null);

  const [editSlug, setEditSlug] = createSignal("");
  const [editPassword, setEditPassword] = createSignal("");
  const [editError, setEditError] = createSignal<string | null>(null);
  const [editSaving, setEditSaving] = createSignal(false);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${_SERVER_HOST}/api/share/viz/all`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceIds: p.visualizations.map((v) => v.id) }),
      });
      const json = await res.json();
      setTokens(json.success ? json.tokens : []);
    } catch {
      setTokens([]);
    }
    setLoading(false);
  };

  onMount(() => {
    fetchTokens();
  });

  const copyUrl = async (t: AllShareToken) => {
    const url = `${window.location.origin}/share/viz/${t.slug ?? t.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(t.token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const deleteToken = async (token: string) => {
    await fetch(`${_SERVER_HOST}/api/share/viz/${token}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchTokens();
  };

  const startEdit = (t: AllShareToken) => {
    setEditSlug(t.slug ?? "");
    setEditPassword(t.password ?? "");
    setEditError(null);
    setEditing(t);
  };

  const handleEdit = async () => {
    const t = editing();
    if (!t) return;
    setEditSaving(true);
    setEditError(null);
    const res = await fetch(`${_SERVER_HOST}/api/share/viz/${t.token}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: editSlug().trim() || null,
        password: editPassword().trim() || null,
      }),
    });
    const result = await res.json();
    setEditSaving(false);
    if (result.success) {
      setEditing(null);
      await fetchTokens();
    } else if (result.error === "slug_taken") {
      setEditError("That slug is already in use. Try a different one.");
    } else {
      setEditError("Something went wrong. Please try again.");
    }
  };

  const vizsWithTokens = () => {
    const tokenList = tokens();
    return p.visualizations
      .map((viz) => ({
        viz,
        tokens: tokenList.filter((t) => t.resourceId === viz.id),
      }))
      .filter((entry) => entry.tokens.length > 0);
  };

  return (
    <Switch>
      <Match when={editing()} keyed>
        {(_t) => (
          <ModalContainer
            title="Edit share link"
            rightButtons={
              <>
                <Button onClick={() => setEditing(null)} outline>Cancel</Button>
                <Button onClick={handleEdit} disabled={editSaving()}>
                  {editSaving() ? "Saving..." : "Save"}
                </Button>
              </>
            }
          >
            <div class="flex flex-col ui-gap">
              <Input
                value={editSlug()}
                onChange={(val) => {
                  setEditError(null);
                  setEditSlug(sanitizeSlug(val));
                }}
                placeholder="custom-slug (optional)"
                label="Custom slug"
              />
              <Show when={editSlug() && !editError()}>
                <div class="text-neutral text-xs">
                  URL: {window.location.origin}/share/viz/{editSlug()}
                </div>
              </Show>
              <Input
                value={editPassword()}
                onChange={setEditPassword}
                placeholder="Leave blank for public access"
                label="Password (optional)"
              />
              <Show when={editError()}>
                <div class="text-danger text-xs">{editError()}</div>
              </Show>
            </div>
          </ModalContainer>
        )}
      </Match>

      <Match when={!editing()}>
        <ModalContainer
          title="All share links"
          rightButtons={<Button onClick={() => p.close()}>Done</Button>}
        >
          <Show when={loading()}>
            <div class="text-neutral text-sm">Loading...</div>
          </Show>
          <Show
            when={!loading() && tokens().length > 0}
            fallback={
              <Show when={!loading()}>
                <div class="text-neutral text-sm">No share links have been created yet.</div>
              </Show>
            }
          >
            <div class="flex flex-col ui-gap">
              <For each={vizsWithTokens()}>
                {(entry) => (
                  <div>
                    <div class="font-600 text-sm mb-1">{entry.viz.label}</div>
                    <For each={entry.tokens}>
                      {(t, i) => (
                        <div
                          class="border-base-300 py-2"
                          classList={{ "border-t": i() > 0 }}
                        >
                          <div class="ui-gap flex items-center">
                            <div class="text-neutral flex-1 text-sm">
                              <Show when={t.slug}>
                                <span class="text-base-content font-500">{t.slug}</span>
                                {" · "}
                              </Show>
                              Created: {new Date(t.createdAt).toLocaleDateString()}
                              {" · "}
                              Views: {t.viewCount}
                            </div>
                            <div class="ui-gap-sm flex items-center">
                              <Button
                                onClick={() => copyUrl(t)}
                                size="sm"
                                iconName="copy"
                              >
                                {copiedToken() === t.token ? "Copied!" : "Copy"}
                              </Button>
                              <Button
                                onClick={() => startEdit(t)}
                                size="sm"
                                iconName="pencil"
                                outline
                              />
                              <Button
                                onClick={() => deleteToken(t.token)}
                                size="sm"
                                iconName="trash"
                                intent="danger"
                                outline
                              />
                            </div>
                          </div>
                          <Show when={t.password}>
                            <div class="text-neutral text-xs mt-1 flex items-center ui-gap-sm">
                              <span class="inline-flex items-center align-middle">
                                <IconRenderer iconName="lock" size="sm" />
                              </span>
                              Password:{" "}
                              <span class="text-base-content">{t.password}</span>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </ModalContainer>
      </Match>
    </Switch>
  );
}
