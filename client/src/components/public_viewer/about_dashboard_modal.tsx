import { t3 } from "lib";
import {
  Button,
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
      })}
      width="lg"
      leftButtons={[
        // eslint-disable-next-line jsx-key
        <Button
          onClick={() => p.close(undefined)}
          intent="neutral"
          iconName="x"
        >
          {t3({ en: "Close", fr: "Fermer" })}
        </Button>,
      ]}
    >
      <div class="ui-spy md-dark-adapt">
        <MarkdownPresentationJsx markdown={p.body} />
        <Show when={p.logos.length > 0}>
          <DashboardLogos selected={p.logos} />
        </Show>
      </div>
    </ModalContainer>
  );
}
