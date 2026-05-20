import { createSignal, Show } from "solid-js";
import { Button, Input, ModalContainer } from "panther";
import type { AlertComponentProps } from "panther";

type PasswordAction = "keep" | "clear" | "set";

type Props = {
  currentSlug: string | null;
  hasPassword: boolean;
  updateLink: (
    slug: string | null,
    passwordAction: "keep" | "clear" | "set",
    newPassword?: string,
  ) => Promise<{ success: boolean; error?: string }>;
};

export function EditShareLinkModal(p: AlertComponentProps<Props, void>) {
  const [slug, setSlug] = createSignal(p.currentSlug ?? "");
  const [passwordAction, setPasswordAction] = createSignal<PasswordAction>(
    "keep",
  );
  const [newPassword, setNewPassword] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const sanitizeSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  const slugValue = () => slug().trim() || null;

  const handleSave = async () => {
    if (passwordAction() === "set" && !newPassword().trim()) {
      setError("Enter a password or choose a different option.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await p.updateLink(
      slugValue(),
      passwordAction(),
      passwordAction() === "set" ? newPassword().trim() : undefined,
    );
    setSaving(false);
    if (result.success) {
      p.close();
    } else if (result.error === "slug_taken") {
      setError("That slug is already in use. Try a different one.");
    } else {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <ModalContainer
      title="Edit share link"
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving()}>
            {saving() ? "Saving..." : "Save"}
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

        <div class="flex flex-col ui-gap-sm">
          <div class="text-base-content text-sm font-500">Password</div>
          <div class="flex flex-col ui-gap-sm">
            <Show when={p.hasPassword}>
              <label class="flex items-center ui-gap-sm cursor-pointer">
                <input
                  type="radio"
                  name="pwd-action"
                  checked={passwordAction() === "keep"}
                  onChange={() => setPasswordAction("keep")}
                />
                <span class="text-sm">Keep current password</span>
              </label>
              <label class="flex items-center ui-gap-sm cursor-pointer">
                <input
                  type="radio"
                  name="pwd-action"
                  checked={passwordAction() === "clear"}
                  onChange={() => setPasswordAction("clear")}
                />
                <span class="text-sm">Remove password</span>
              </label>
            </Show>
            <Show when={!p.hasPassword}>
              <label class="flex items-center ui-gap-sm cursor-pointer">
                <input
                  type="radio"
                  name="pwd-action"
                  checked={passwordAction() === "keep"}
                  onChange={() => setPasswordAction("keep")}
                />
                <span class="text-sm">No password</span>
              </label>
            </Show>
            <label class="flex items-center ui-gap-sm cursor-pointer">
              <input
                type="radio"
                name="pwd-action"
                checked={passwordAction() === "set"}
                onChange={() => setPasswordAction("set")}
              />
              <span class="text-sm">
                {p.hasPassword ? "Change password" : "Add password"}
              </span>
            </label>
            <Show when={passwordAction() === "set"}>
              <Input
                value={newPassword()}
                onChange={(val) => setNewPassword(val)}
                placeholder="New password"
                type="password"
              />
            </Show>
          </div>
        </div>

        <Show when={error()}>
          <div class="text-danger text-xs">{error()}</div>
        </Show>
      </div>
    </ModalContainer>
  );
}
