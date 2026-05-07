import { createResource, createSignal, For, Show } from "solid-js";
import { Button } from "panther";
import type { FigureInputs } from "panther";
import type { PresentationObjectConfig, ShareTokenInfo, ShareVizBundle, IndicatorMetadata } from "lib";
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

async function fetchExistingTokens(resourceId: string): Promise<ShareTokenInfo[]> {
  const res = await fetch(`${_SERVER_HOST}/api/share/viz?resourceId=${resourceId}`, {
    credentials: "include",
  });
  const json = await res.json();
  return json.success ? json.tokens : [];
}

export function ShareVisualizationModal(p: Props) {
  const [tokens, { refetch }] = createResource(
    () => p.presentationObjectId,
    fetchExistingTokens,
  );
  const [creating, setCreating] = createSignal(false);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);

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
      refetch();
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  const deleteToken = async (token: string) => {
    await fetch(`${_SERVER_HOST}/api/share/viz/${token}`, {
      method: "DELETE",
      credentials: "include",
    });
    refetch();
  };

  const copyUrl = async (token: string) => {
    const url = `${window.location.origin}/share/viz/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div style={{ padding: "20px", "min-width": "400px" }}>
      <h2 style={{ margin: "0 0 16px 0" }}>Share Visualization</h2>

      <Button onClick={createShareLink} disabled={creating()}>
        {creating() ? "Creating..." : "Create New Share Link"}
      </Button>

      <Show when={tokens() && tokens()!.length > 0}>
        <div style={{ "margin-top": "20px" }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Existing Links</h3>
          <For each={tokens()}>
            {(t) => (
              <div style={{
                display: "flex",
                "align-items": "center",
                gap: "8px",
                padding: "8px",
                "border-bottom": "1px solid #eee",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ "font-size": "12px", color: "#666" }}>
                    Created: {new Date(t.createdAt).toLocaleDateString()}
                    {" · "}
                    Views: {t.viewCount}
                  </div>
                </div>
                <Button onClick={() => copyUrl(t.token)}>
                  {copiedToken() === t.token ? "Copied!" : "Copy"}
                </Button>
                <Button onClick={() => deleteToken(t.token)}>Delete</Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div style={{ "margin-top": "20px", "text-align": "right" }}>
        <Button onClick={() => p.close()}>Close</Button>
      </div>
    </div>
  );
}
