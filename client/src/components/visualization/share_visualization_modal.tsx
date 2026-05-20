import { createSignal, For, onMount, Show } from "solid-js";
import { Button, IconRenderer, ModalContainer, openComponent } from "panther";
import type { FigureInputs } from "panther";
import type {
  PresentationObjectConfig,
  ShareTokenInfo,
  ShareVizBundle,
  IndicatorMetadata,
} from "lib";
import { stripFigureInputsForStorage } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";
import { CreateShareLinkModal } from "./create_share_link_modal";
import { EditShareLinkModal } from "./edit_share_link_modal";

import type { AlertComponentProps } from "panther";

type PropsBase = {
  presentationObjectId: string;
  label: string;
  config: PresentationObjectConfig;
  metricId: string;
  formatAs: "percent" | "number";
  figureInputs: FigureInputs;
  geoData?: unknown;
  indicatorMetadata?: IndicatorMetadata[];
};

type Props = AlertComponentProps<PropsBase, void>;

function tokenUrl(token: string, slug: string | null) {
  return `${window.location.origin}/share/viz/${slug ?? token}`;
}

export function ShareVisualizationModal(p: Props) {
  const [tokens, setTokens] = createSignal<ShareTokenInfo[]>([]);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);

  const fetchTokens = async () => {
    const res = await fetch(
      `${_SERVER_HOST}/api/share/viz?resourceId=${p.presentationObjectId}`,
      { credentials: "include" },
    );
    const json = await res.json();
    setTokens(json.success ? json.tokens : []);
  };

  onMount(() => {
    fetchTokens();
  });

  const buildBundle = (): ShareVizBundle => ({
    label: p.label,
    strippedFigureInputs: stripFigureInputsForStorage(p.figureInputs),
    source: { config: p.config, metricId: p.metricId, formatAs: p.formatAs },
    geoData: p.geoData,
    indicatorMetadata: p.indicatorMetadata,
  });

  const createLink = async (slug: string | null, password: string | null) => {
    const res = await fetch(`${_SERVER_HOST}/api/share/viz`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: p.presentationObjectId, bundle: buildBundle(), slug, password }),
    });
    return res.json();
  };

  const handleCreateLink = async () => {
    const result = await openComponent({
      element: CreateShareLinkModal,
      props: { createLink },
    });
    if (result === undefined) return;
    const url = tokenUrl(result.token, result.slug);
    await navigator.clipboard.writeText(url);
    setCopiedToken(result.token);
    fetchTokens();
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const editToken = async (t: ShareTokenInfo) => {
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

  const copyUrl = async (t: ShareTokenInfo) => {
    const url = tokenUrl(t.token, t.slug);
    await navigator.clipboard.writeText(url);
    setCopiedToken(t.token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <ModalContainer
      title="Share visualization"
      rightButtons={<Button onClick={() => p.close()}>Done</Button>}
    >
      <Button onClick={handleCreateLink} iconName="plus">
        Create New Share Link
      </Button>

      <Show when={tokens().length > 0}>
        <div style={{ "margin-top": "20px" }}>
          <h3 class="font-700 text-sm">Existing links</h3>
          <For each={tokens()}>
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
                    <span class="inline-flex items-center align-middle">
                      <IconRenderer iconName="lock" size="sm" />
                    </span>
                    {" · "}
                  </Show>
                  Created: {new Date(t.createdAt).toLocaleDateString()}
                  {" · "}
                  Views: {t.viewCount}
                </div>
                <div class="ui-gap-sm flex items-center">
                  <Button onClick={() => copyUrl(t)} size="sm" iconName="copy">
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
      </Show>
    </ModalContainer>
  );
}
