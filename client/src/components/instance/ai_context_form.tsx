import { t3 } from "lib";
import {
  AlertFormHolder,
  TextArea,
  createFormAction,
  type AlertComponentProps,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// The instance-level copilot grounding (D15) — one text for the whole
// instance. There is no getter: the value rides InstanceState with the rest of
// the config, so this reads the store and only ever writes.
export function AiContextForm(p: AlertComponentProps<{}, undefined>) {
  const [tempAiContext, setTempAiContext] = createSignal(
    instanceState.aiContext,
  );

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      return serverActions.updateAiContextConfig({
        aiContext: tempAiContext(),
      });
    },
    () => {
      p.close(undefined);
    },
  );

  return (
    <AlertFormHolder
      formId="ai-context"
      header={t3({
        en: "AI context",
        fr: "Contexte IA",
        pt: "Contexto de IA",
      })}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
    >
      <TextArea
        label={t3({
          en: "Background the AI assistant should know about this country and its health system",
          fr: "Contexte que l'assistant IA doit connaître sur ce pays et son système de santé",
          pt: "Contexto que o assistente de IA deve conhecer sobre este país e o seu sistema de saúde",
        })}
        value={tempAiContext()}
        onChange={setTempAiContext}
        rows={16}
        fullWidth
      />
    </AlertFormHolder>
  );
}
