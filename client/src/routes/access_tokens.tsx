import { Button, Input, Table, type TableColumn } from "panther";
import { createResource, createSignal, Show } from "solid-js";
import type { PersonalAccessTokenSummary } from "lib";
import { LoggedInWrapper } from "~/components/LoggedInWrapper";
import { serverActions } from "~/server_actions";

// Standalone, unlisted personal-access-token panel (/access-tokens). Linked
// from nowhere in the app on purpose — you reach it by knowing the URL — but
// everything behind it is the normal Clerk-gated self-service PAT API, so an
// unauthenticated visitor just gets the login screen and a logged-in user can
// only ever mint/list/revoke their OWN tokens. Tokens are for headless
// clients (the MCP host — see USER_GUIDE_MCP.md); the value is shown once at
// mint and only its hash is stored.

export default function AccessTokensPage() {
  return (
    <LoggedInWrapper>
      {(globalUser) => <AccessTokensPanel email={globalUser.email} />}
    </LoggedInWrapper>
  );
}

function formatDate(iso: string | null): string {
  return iso === null ? "—" : new Date(iso).toLocaleString();
}

function AccessTokensPanel(p: { email: string }) {
  const [tokens, { refetch }] = createResource(async () => {
    const res = await serverActions.listPersonalAccessTokens({});
    if (!res.success) {
      throw new Error(res.err);
    }
    return res.data;
  });

  const [label, setLabel] = createSignal("");
  const [minting, setMinting] = createSignal(false);
  const [mintError, setMintError] = createSignal<string | null>(null);
  const [freshToken, setFreshToken] = createSignal<
    { label: string; token: string } | null
  >(null);
  const [copied, setCopied] = createSignal(false);

  async function mint(): Promise<void> {
    const trimmed = label().trim();
    if (trimmed === "" || minting()) {
      return;
    }
    setMinting(true);
    setMintError(null);
    const res = await serverActions.createPersonalAccessToken({
      label: trimmed,
    });
    setMinting(false);
    if (!res.success) {
      setMintError(res.err);
      return;
    }
    setFreshToken({ label: trimmed, token: res.data.token });
    setCopied(false);
    setLabel("");
    refetch();
  }

  async function revoke(pat: PersonalAccessTokenSummary): Promise<void> {
    if (
      !confirm(
        `Revoke token "${pat.label}"? Anything using it stops working immediately.`,
      )
    ) {
      return;
    }
    const res = await serverActions.revokePersonalAccessToken({ id: pat.id });
    if (!res.success) {
      alert(`Could not revoke: ${res.err}`);
      return;
    }
    if (freshToken()?.label === pat.label) {
      setFreshToken(null);
    }
    refetch();
  }

  async function copyToken(): Promise<void> {
    const t = freshToken();
    if (!t) {
      return;
    }
    await navigator.clipboard.writeText(t.token);
    setCopied(true);
  }

  const columns: TableColumn<PersonalAccessTokenSummary>[] = [
    {
      key: "label",
      header: "Label",
      sortable: true,
      render: (pat) => <span class="font-mono text-sm">{pat.label}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (pat) => <span class="text-sm">{formatDate(pat.createdAt)}</span>,
    },
    {
      key: "lastUsedAt",
      header: "Last used",
      sortable: true,
      render: (pat) => (
        <span class="text-sm">{formatDate(pat.lastUsedAt)}</span>
      ),
    },
    {
      key: "id",
      header: "",
      render: (pat) => (
        <Button size="sm" intent="danger" onClick={() => revoke(pat)}>
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <div class="mx-auto max-w-3xl p-8">
      <h1 class="ui-text-heading mb-2">Personal access tokens</h1>
      <p class="mb-6 text-sm">
        Tokens for headless clients (the MCP assistant). A token acts as{" "}
        <span class="font-mono">{p.email}</span> with your permissions, on a
        restricted route allowlist. Treat it like a password; revoke it when
        you are done.
      </p>

      <div class="mb-2 flex items-end gap-2">
        <div class="flex-1">
          <Input
            value={label()}
            onChange={setLabel}
            placeholder="Label (e.g. laptop-claude)"
          />
        </div>
        <Button
          intent="primary"
          onClick={mint}
          disabled={minting() || label().trim() === ""}
        >
          Create token
        </Button>
      </div>
      <Show when={mintError()}>
        {(err) => <p class="mb-4 text-sm text-danger">{err()}</p>}
      </Show>

      <Show when={freshToken()}>
        {(fresh) => (
          <div class="border-border bg-base-200 mb-6 rounded border p-4">
            <p class="mb-2 text-sm">
              Token for <span class="font-mono">{fresh().label}</span> — copy
              it now, it is shown only once:
            </p>
            <div class="flex items-center gap-2">
              <code class="flex-1 break-all text-sm">{fresh().token}</code>
              <Button size="sm" onClick={copyToken}>
                {copied() ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </Show>

      <Show
        when={!tokens.error}
        fallback={
          <p class="text-sm text-danger">
            Could not load tokens: {String(tokens.error)}
          </p>
        }
      >
        <Table
          data={tokens() ?? []}
          columns={columns}
          keyField="id"
          noRowsMessage="No tokens yet"
        />
      </Show>
    </div>
  );
}
