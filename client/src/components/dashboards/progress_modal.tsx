import { t3 } from "lib";
import {
  type AlertComponentProps,
  Button,
  ModalContainer,
  ProgressBar,
  getProgress,
} from "panther";
import { Show, createSignal, onMount } from "solid-js";

type Props = {
  title: string;
  run: (
    report: (frac: number, msg: string) => void,
  ) => Promise<{ success: true } | { success: false; err: string }>;
};

type ReturnType = { ok: boolean };

// Progress-only modal: runs `run` immediately on open (reporting progress) and
// closes itself on success. There is no confirm/cancel button, so it gives
// feedback for a multi-second operation (e.g. re-resolving a group's members)
// without the cancel-discards-the-edit footgun and without letting the user
// reopen the entry mid-save. On failure it shows the error with a Close button.
export function ProgressModal(p: AlertComponentProps<Props, ReturnType>) {
  const progress = getProgress();
  const [err, setErr] = createSignal<string | undefined>();

  onMount(async () => {
    const res = await p.run((frac, msg) => progress.onProgress(frac, msg));
    if (res.success) {
      p.close({ ok: true });
    } else {
      setErr(res.err);
    }
  });

  return (
    <ModalContainer title={p.title} width="md">
      <Show
        when={err()}
        fallback={
          <ProgressBar
            progressFrom0To100={progress.progressFrom0To100()}
            progressMsg={progress.progressMsg()}
            small
          />
        }
      >
        <div class="ui-spy">
          <div class="text-danger text-sm">{err()}</div>
          <Button
            onClick={() => p.close({ ok: false })}
            intent="neutral"
            iconName="x"
          >
            {t3({ en: "Close", fr: "Fermer" })}
          </Button>
        </div>
      </Show>
    </ModalContainer>
  );
}
