import { t3 } from "lib";
import {
  type AlertComponentProps,
  ModalContainer,
  openComponent,
} from "panther";
import { serverActions } from "~/server_actions";
import { wasProductCreatedThisVisit } from "~/state/t4_ui";

type Kind = "report" | "slide_deck";

// An editor's Back. A report or deck this user created since the page loaded
// and left still holding nothing (the caller's `untouched`) is offered for
// deletion: Keep closes as usual, Delete closes and then deletes it. Closing
// first lets the editor tear down its collab session before the row goes; the
// delete route closes any room still open on it. Created this visit means the
// user is its owner, which the delete requires.
export async function closeOrDiscardEmptyProduct(p: {
  productId: string;
  kind: Kind;
  untouched: () => boolean | Promise<boolean>;
  close: () => void;
}): Promise<void> {
  if (!wasProductCreatedThisVisit(p.productId) || !(await p.untouched())) {
    p.close();
    return;
  }
  const choice = await openComponent({
    element: DiscardEmptyProductModal,
    props: { kind: p.kind },
  });
  if (choice === undefined) return;
  p.close();
  if (choice === "delete") {
    await serverActions.deleteProducts({ productIds: [p.productId] });
  }
}

function DiscardEmptyProductModal(
  p: AlertComponentProps<{ kind: Kind }, "keep" | "delete">,
) {
  return (
    <ModalContainer
      title={p.kind === "report"
        ? t3({
          en: "This report is empty",
          fr: "Ce rapport est vide",
          pt: "Este relatório está vazio",
        })
        : t3({
          en: "This slide deck is empty",
          fr: "Cette présentation est vide",
          pt: "Esta apresentação está vazia",
        })}
      width="sm"
      // Escape or the X stays in the editor; only the two buttons leave.
      onCancel={() => p.close(undefined)}
      actions={[
        {
          label: t3({ en: "Keep", fr: "Conserver", pt: "Manter" }),
          intent: "neutral",
          outline: true,
          onClick: () => p.close("keep"),
        },
        {
          label: t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" }),
          intent: "danger",
          iconName: "trash",
          onClick: () => p.close("delete"),
        },
      ]}
    >
      <div>
        {p.kind === "report"
          ? t3({
            en:
              "Nothing has been added to it yet. Delete it, or keep it to work on later?",
            fr:
              "Rien n'y a encore été ajouté. Le supprimer, ou le conserver pour y travailler plus tard ?",
            pt:
              "Ainda não foi adicionado nada. Eliminá-lo, ou mantê-lo para trabalhar mais tarde?",
          })
          : t3({
            en:
              "Nothing has been added to it yet. Delete it, or keep it to work on later?",
            fr:
              "Rien n'y a encore été ajouté. La supprimer, ou la conserver pour y travailler plus tard ?",
            pt:
              "Ainda não foi adicionado nada. Eliminá-la, ou mantê-la para trabalhar mais tarde?",
          })}
      </div>
    </ModalContainer>
  );
}
