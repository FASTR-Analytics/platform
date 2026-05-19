import { createSignal, JSX, Show } from "solid-js";
import { Button, Input } from "panther";

type Props = {
  requiresPassword: boolean;
  wrongPassword?: boolean;
  onSubmit: (password: string) => void;
  children: JSX.Element;
};

export function PasswordGate(p: Props) {
  const [passwordInput, setPasswordInput] = createSignal("");

  const submit = () => {
    const pwd = passwordInput().trim();
    if (!pwd) return;
    p.onSubmit(pwd);
  };

  return (
    <Show
      when={!p.requiresPassword}
      fallback={
        <div class="flex h-full items-center justify-center">
          <div class="flex w-72 flex-col ui-gap">
            <div class="text-base-content font-600 text-sm">
              This content is password protected
            </div>
            <Input
              value={passwordInput()}
              onChange={setPasswordInput}
              placeholder="Enter password"
              type="password"
            />
            <Show when={p.wrongPassword}>
              <div class="text-danger text-xs">
                Incorrect password. Please try again.
              </div>
            </Show>
            <Button onClick={submit}>View</Button>
          </div>
        </div>
      }
    >
      {p.children}
    </Show>
  );
}
