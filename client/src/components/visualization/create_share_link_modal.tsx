import { createSignal, Show } from "solid-js";
import { Button, Input, ModalContainer } from "panther";
import type { AlertComponentProps } from "panther";

type Props = {
  createLink: (slug: string | null, password: string | null) => Promise<
    | { success: true; token: string; slug: string | null }
    | { success: false; error: string }
  >;
};

type ReturnType = { token: string; slug: string | null };

export function CreateShareLinkModal(p: AlertComponentProps<Props, ReturnType>) {
  const [slug, setSlug] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const sanitizeSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  const slugValue = () => slug().trim() || null;
  const passwordValue = () => password().trim() || null;

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    const result = await p.createLink(slugValue(), passwordValue());
    setCreating(false);
    if (result.success) {
      p.close({ token: result.token, slug: result.slug });
    } else if (result.error === "slug_taken") {
      setError("That slug is already in use. Try a different one.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <ModalContainer
      title="Create share link"
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating()}>
            {creating() ? "Creating..." : "Create"}
          </Button>
        </>
      }
    >
      <div class="flex flex-col ui-gap">
        <Input
          value={slug()}
          onChange={(val) => {
            setError(null);
            setSlug(sanitizeSlug(val));
          }}
          placeholder="custom-slug (optional)"
          label="Custom slug"
        />
        <Show when={slug() && !error()}>
          <div class="text-neutral text-xs">
            URL: {window.location.origin}/share/viz/{slug()}
          </div>
        </Show>
        <Input
          value={password()}
          onChange={(val) => setPassword(val)}
          placeholder="Leave blank for public access"
          label="Password (optional)"
          type="password"
        />
        <Show when={error()}>
          <div class="text-danger text-xs">{error()}</div>
        </Show>
      </div>
    </ModalContainer>
  );
}
