import { t3, type APIResponseWithData } from "lib";
import {
  type AlertComponentProps,
  ModalContainer,
  createFormAction,
  Input,
} from "panther";
import { createSignal } from "solid-js";

// "Restore as copy" name prompt: the zero-risk restore path: the version
// becomes a brand-new document and the original is untouched.
export function CopyVersionModal(
  p: AlertComponentProps<
    {
      header: string;
      initialLabel: string;
      save: (label: string) => Promise<APIResponseWithData<unknown>>;
    },
    boolean
  >,
) {
  const [tempLabel, setTempLabel] = createSignal(p.initialLabel);

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (!label) {
        return {
          success: false as const,
          err: t3({ en: "Name is required", fr: "Le nom est requis", pt: "O nome é obrigatório" }),
        };
      }
      return await p.save(label);
    },
    (data) => {
      if (data) {
        p.close(true);
      }
    },
  );

  return (
    <ModalContainer
      title={p.header}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
        disabled: !tempLabel().trim(),
      }]}
    >
      <Input
        label={t3({ en: "Name for the copy", fr: "Nom de la copie", pt: "Nome da cópia" })}
        value={tempLabel()}
        onChange={setTempLabel}
        fullWidth
        autoFocus
      />
    </ModalContainer>
  );
}
