import { createSignal, For, onMount, Show } from "solid-js";
import { Button, ModalContainer } from "panther";
import type { FigureInputs } from "panther";
import type {
  PresentationObjectConfig,
  ShareTokenInfo,
  ShareVizBundle,
  IndicatorMetadata,
} from "lib";
import { stripFigureInputsForStorage } from "~/generate_visualization/strip_figure_inputs";
import { _SERVER_HOST } from "~/server_actions";

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

export function ShareVisualizationModal(p: Props) {
  const [tokens, setTokens] = createSignal<ShareTokenInfo[]>([]);
  const [creating, setCreating] = createSignal(false);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);

  const fetchTokens = async () => {
    const res = await fetch(
      `${_SERVER_HOST}/api/share/viz?resourceId=${p.presentationObjectId}`,
      {
        credentials: "include",
      },
    );
    const json = await res.json();
    setTokens(json.success ? json.tokens : []);
  };

  onMount(() => {
    fetchTokens();
  });

  const createShareLink = async () => {
    setCreating(true);
    const stripped = stripFigureInputsForStorage(p.figureInputs);
    const bundle: ShareVizBundle = {
      label: p.label,
      strippedFigureInputs: stripped,
      source: {
        config: p.config,
        metricId: p.metricId,
        formatAs: p.formatAs,
      },
      geoData: p.geoData,
      indicatorMetadata: p.indicatorMetadata,
    };

    const res = await fetch(`${_SERVER_HOST}/api/share/viz`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: p.presentationObjectId, bundle }),
    });
    const json = await res.json();
    setCreating(false);

    if (json.success) {
      const url = `${window.location.origin}/share/viz/${json.token}`;
      await navigator.clipboard.writeText(url);
      setCopiedToken(json.token);
      fetchTokens();
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  const deleteToken = async (token: string) => {
    await fetch(`${_SERVER_HOST}/api/share/viz/${token}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchTokens();
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/share/viz/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <ModalContainer
      title="Share visualization"
      rightButtons={<Button onClick={() => p.close()}>Done</Button>}
    >
      <Button onClick={createShareLink} disabled={creating()}>
        {creating() ? "Creating..." : "Create New Share Link"}
      </Button>

      <Show when={tokens() && tokens()!.length > 0}>
        <div style={{ "margin-top": "20px" }}>
          <h3 class="font-700 text-sm">Existing links</h3>
          <For each={tokens()}>
            {(t, i) => (
              <div
                class="ui-gap border-base-300 flex items-center py-2"
                classList={{
                  "border-t": i() > 0,
                }}
                // style={{
                //   "border-bottom": "1px solid #eee",
                // }}
              >
                <div class="text-neutral flex-1 text-sm">
                  <div>
                    Created: {new Date(t.createdAt).toLocaleDateString()}
                    {" · "}
                    Views: {t.viewCount}
                  </div>
                </div>
                <div class="ui-gap-sm flex items-center">
                  <Button
                    onClick={() => copyUrl(t.token)}
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
                  >
                    {/* Delete */}
                  </Button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </ModalContainer>
  );
}
