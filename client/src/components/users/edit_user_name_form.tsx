import { type OtherUser, t3 } from "lib";
import {
  type AlertComponentProps,
  createFormAction,
  Input,
  ModalContainer,
  openAlert,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  user: OtherUser;
};

// The roster broadcast carries the new name back to the user page, so the
// modal returns nothing.
export function EditUserNameForm(p: AlertComponentProps<Props, undefined>) {
  const [tempFirstName, setTempFirstName] = createSignal(
    p.user.firstName ?? "",
  );
  const [tempLastName, setTempLastName] = createSignal(p.user.lastName ?? "");

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      if (!tempFirstName().trim() && !tempLastName().trim()) {
        return {
          success: false,
          err: t3({
            en: "Enter a first or last name",
            fr: "Saisissez un prénom ou un nom",
            pt: "Introduza um nome próprio ou apelido",
          }),
        };
      }
      return serverActions.setUserName({
        email: p.user.email,
        firstName: tempFirstName(),
        lastName: tempLastName(),
      });
    },
    async (data) => {
      p.close(undefined);
      if (data.warnings.length > 0) {
        await openAlert({ text: data.warnings.join("\n") });
      }
    },
  );

  return (
    <ModalContainer
      title={t3({
        en: "Edit name",
        fr: "Modifier le nom",
        pt: "Editar nome",
      })}
      form
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Save", fr: "Sauvegarder", pt: "Guardar" }),
        onClick: save.click,
        state: save.state(),
      }]}
    >
      <Input
        label={t3({ en: "First name", fr: "Prénom", pt: "Nome próprio" })}
        value={tempFirstName()}
        onChange={setTempFirstName}
        autoFocus
        fullWidth
      />
      <Input
        label={t3({ en: "Last name", fr: "Nom", pt: "Apelido" })}
        value={tempLastName()}
        onChange={setTempLastName}
        fullWidth
      />
      <div class="text-xs">
        {t3({
          en:
            "The new name applies to this user's account and on every FASTR instance.",
          fr:
            "Le nouveau nom s'applique au compte de cet utilisateur et sur toutes les instances FASTR.",
          pt:
            "O novo nome aplica-se à conta deste utilizador e em todas as instâncias FASTR.",
        })}
      </div>
    </ModalContainer>
  );
}
