import { t3 } from "lib";
import {
  EditorComponentProps,
  MarkdownPresentationJsx,
  ModalContainer,
} from "panther";
import { Show } from "solid-js";
import { DashboardLogos } from "./dashboard_logos.tsx";

export type AboutDashboardModalProps = {
  body: string;
  logos: string[];
};

export function AboutDashboardModal(
  p: EditorComponentProps<AboutDashboardModalProps, void>,
) {
  return (
    <ModalContainer
      title={t3({
        en: "About this dashboard",
        fr: "À propos de ce tableau de bord",
        pt: "Acerca deste painel",
      })}
      width="lg"
      onCancel={() => p.close(undefined)}
      cancelLabel={t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
    >
      <div class="ui-spy">
        <MarkdownPresentationJsx markdown={p.body} />
        <Show when={p.logos.length > 0}>
          <DashboardLogos selected={p.logos} />
        </Show>
      </div>
    </ModalContainer>
  );
}
