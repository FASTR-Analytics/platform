import { createSignal, For, onMount, Show } from "solid-js";
import { Button, IconRenderer, ModalContainer, openComponent } from "panther";
import type { AlertComponentProps } from "panther";
import { EditShareLinkModal } from "./edit_share_link_modal";
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

  const editToken = async (t: AllShareToken) => {
    const updateLink = async (
      slug: string | null,
      passwordAction: "keep" | "clear" | "set",
      newPassword?: string,
    ) => {
      const res = await fetch(`${_SERVER_HOST}/api/share/viz/${t.token}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, passwordAction, newPassword }),
      });
      return res.json();
    };
    await openComponent({
      element: EditShareLinkModal,
      props: { currentSlug: t.slug, hasPassword: t.hasPassword, updateLink },
    });
    fetchTokens();
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
                        <Show when={t.hasPassword}>
                          <IconRenderer iconName="lock" size="sm" />
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
                          onClick={() => editToken(t)}
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
