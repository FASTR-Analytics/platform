import { openConfirm } from "panther";
import { t3 } from "lib";
import { createSignal } from "solid-js";

// Whether the chat has a turn in flight, set by the pane from its instance.
// A reload loses the turn and the conversation's record of what it applied
// (the record is written in the turn's finally), so every control that
// reloads the page (the language menu; the profile's Clear data cache, Clear
// AI chat history, Sign out and Change email) asks first while a turn runs.
const [turnRunning, setTurnRunning] = createSignal(false);

export { setTurnRunning };

// True when the reload may proceed: at once with no turn in flight, else
// once the user confirms.
export async function confirmReloadUnderTurn(): Promise<boolean> {
  if (!turnRunning()) return true;
  return await openConfirm({
    title: t3({
      en: "The AI is still working",
      fr: "L'IA travaille encore",
      pt: "A IA ainda está a trabalhar",
    }),
    text: t3({
      en:
        "Leaving now stops its turn, and the conversation will not record what it changed. Continue anyway?",
      fr:
        "Partir maintenant interrompt son tour, et la conversation ne gardera pas trace de ce qu'elle a modifié. Continuer quand même ?",
      pt:
        "Sair agora interrompe a sua vez, e a conversa não registará o que alterou. Continuar mesmo assim?",
    }),
    intent: "warning",
    confirmButtonLabel: t3({
      en: "Continue",
      fr: "Continuer",
      pt: "Continuar",
    }),
  });
}
