import { createSignal, For, onMount, Show, Switch, Match } from "solid-js";
import { Button, IconRenderer, Input, ModalContainer } from "panther";
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

type Mode = "list" | "create" | { editing: ShareTokenInfo };

function tokenUrl(token: string, slug: string | null) {
  return `${window.location.origin}/share/viz/${slug ?? token}`;
}

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
}

export function ShareVisualizationModal(p: Props) {
  const [tokens, setTokens] = createSignal<ShareTokenInfo[]>([]);
  const [copiedToken, setCopiedToken] = createSignal<string | null>(null);
  const [mode, setMode] = createSignal<Mode>("list");

  const [slug, setSlug] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [formError, setFormError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

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
    source: {
      config: p.config,
      metricId: p.metricId,
      formatAs: p.formatAs,
      indicatorMetadata: p.indicatorMetadata,
    },
    geoData: p.geoData,
  });

  const startCreate = () => {
    setSlug("");
    setPassword("");
    setFormError(null);
    setMode("create");
  };

  const startEdit = (t: ShareTokenInfo) => {
    setSlug(t.slug ?? "");
    setPassword(t.password ?? "");
    setFormError(null);
    setMode({ editing: t });
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setFormError(null);
    const res = await fetch(`${_SERVER_HOST}/api/share/viz`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceId: p.presentationObjectId,
        bundle: buildBundle(),
        slug: slug().trim() || null,
        password: password().trim() || null,
      }),
    });
    const result = await res.json();
    setSubmitting(false);
    if (result.success) {
      await fetchTokens();
      setMode("list");
    } else if (result.error === "slug_taken") {
      setFormError("That slug is already in use. Try a different one.");
    } else {
      setFormError("Something went wrong. Please try again.");
    }
  };

  const handleEdit = async () => {
    const m = mode();
    if (typeof m !== "object") return;
    setSubmitting(true);
    setFormError(null);
    const res = await fetch(
      `${_SERVER_HOST}/api/share/viz/${m.editing.token}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug().trim() || null,
          password: password().trim() || null,
        }),
      },
    );
    const result = await res.json();
    setSubmitting(false);
    if (result.success) {
      await fetchTokens();
      setMode("list");
    } else if (result.error === "slug_taken") {
      setFormError("That slug is already in use. Try a different one.");
    } else {
      setFormError("Something went wrong. Please try again.");
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

  const isForm = () => mode() !== "list";

  return (
    <ModalContainer
      title={
        mode() === "create"
          ? "Create share link"
          : typeof mode() === "object"
            ? "Edit share link"
            : "Share visualization"
      }
      rightButtons={
        isForm() ? (
          <>
            <Button onClick={() => setMode("list")} outline>
              Cancel
            </Button>
            <Button
              onClick={mode() === "create" ? handleCreate : handleEdit}
              disabled={submitting()}
            >
              {mode() === "create"
                ? submitting()
                  ? "Creating..."
                  : "Create"
                : submitting()
                  ? "Saving..."
                  : "Save"}
            </Button>
          </>
        ) : (
          <Button onClick={() => p.close()}>Done</Button>
        )
      }
    >
      <Switch>
        <Match when={mode() === "list"}>
          <div class="ui-gap flex flex-col">
            <Button onClick={startCreate} iconName="plus">
              Create New Share Link
            </Button>
            <Show when={tokens().length > 0}>
              <div>
                <h3 class="font-700 mb-2 text-sm">Existing links</h3>
                <For each={tokens()}>
                  {(t, i) => (
                    <div
                      class="border-base-300 py-2"
                      classList={{ "border-t": i() > 0 }}
                    >
                      <div class="ui-gap flex items-center">
                        <div class="text-neutral flex-1 text-sm">
                          <Show when={t.slug}>
                            <span class="text-base-content font-500">
                              {t.slug}
                            </span>
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
                        <div class="text-neutral ui-gap-sm mt-1 flex items-center text-xs">
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
            </Show>
          </div>
        </Match>

        <Match when={mode() === "create" || typeof mode() === "object"}>
          <div class="ui-gap flex flex-col">
            <Input
              value={slug()}
              onChange={(val) => {
                setFormError(null);
                setSlug(sanitizeSlug(val));
              }}
              placeholder="custom-slug (optional)"
              label="Custom slug"
            />
            <Show when={slug() && !formError()}>
              <div class="text-neutral text-xs">
                URL: {window.location.origin}/share/viz/{slug()}
              </div>
            </Show>
            <Input
              value={password()}
              onChange={setPassword}
              placeholder="Leave blank for public access"
              label="Password (optional)"
            />
            <Show when={formError()}>
              <div class="text-danger text-xs">{formError()}</div>
            </Show>
          </div>
        </Match>
      </Switch>
    </ModalContainer>
  );
}
