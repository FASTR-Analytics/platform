import { createSignal, For, onMount, Show } from "solid-js";
import { Button, Input, ModalContainer } from "panther";
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

function tokenUrl(token: string, slug: string | null) {
  return `${window.location.origin}/share/viz/${slug ?? token}`;
}

function sanitizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
}

export function ShareVisualizationModal(p: Props) {
  const [tokens, setTokens] = createSignal<ShareTokenInfo[]>([]);
  const [creating, setCreating] = createSignal(false);
  const [slug, setSlug] = createSignal("");
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);
  const [slugError, setSlugError] = createSignal<string | null>(null);

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

  const createShareLink = async () => {
    setCreating(true);
    setSlugError(null);
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

    const slugValue = slug().trim() || null;

    const res = await fetch(`${_SERVER_HOST}/api/share/viz`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId: p.presentationObjectId, bundle, slug: slugValue }),
    });
    const json = await res.json();
    setCreating(false);

    if (json.success) {
      const url = tokenUrl(json.token, json.slug);
      await navigator.clipboard.writeText(url);
      setCopiedToken(json.token);
      setSlug("");
      fetchTokens();
      setTimeout(() => setCopiedToken(null), 2000);
    } else if (json.error?.includes("slug")) {
      setSlugError("That slug is already in use. Try a different one.");
    }
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
      <div class="flex flex-col ui-gap">
        <Input
          value={slug()}
          onChange={(val) => {
            setSlugError(null);
            setSlug(sanitizeSlug(val));
          }}
          placeholder="custom-slug (optional)"
        />
        <Show when={slugError()}>
          <div class="text-danger text-xs">{slugError()}</div>
        </Show>
        <Show when={slug()}>
          <div class="text-neutral text-xs">
            URL: {window.location.origin}/share/viz/{slug()}
          </div>
        </Show>
        <Button onClick={createShareLink} disabled={creating()}>
          {creating() ? "Creating..." : "Create New Share Link"}
        </Button>
      </div>

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
                  <div>
                    <Show when={t.slug}>
                      <span class="text-base-content font-500">{t.slug}</span>
                      {" · "}
                    </Show>
                    Created: {new Date(t.createdAt).toLocaleDateString()}
                    {" · "}
                    Views: {t.viewCount}
                  </div>
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
      </Show>
    </ModalContainer>
  );
}
