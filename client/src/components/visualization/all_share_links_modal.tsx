import { createSignal, For, onMount, Show } from "solid-js";
import { Button, ModalContainer } from "panther";
import type { AlertComponentProps } from "panther";
import type { PresentationObjectSummary, ShareTokenInfo } from "lib";
import { _SERVER_HOST } from "~/server_actions";

type Props = {
  visualizations: PresentationObjectSummary[];
};

type AllShareToken = ShareTokenInfo & { resourceId: string };

export function AllShareLinksModal(p: AlertComponentProps<Props, void>) {
  const [tokens, setTokens] = createSignal<AllShareToken[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);

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
                      class="ui-gap border-base-300 flex items-center py-2"
                      classList={{ "border-t": i() > 0 }}
                    >
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
                          onClick={() => deleteToken(t.token)}
                          size="sm"
                          iconName="trash"
                          intent="danger"
                          outline
                        />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </ModalContainer>
  );
}
