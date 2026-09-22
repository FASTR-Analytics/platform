import {
  type AlertComponentProps,
  Button,
  ModalContainer,
  openComponent,
} from "panther";
import { getHelpUrl, HELP_TARGETS, type HelpId, t3 } from "lib";

export function HelpButton(p: { id: HelpId }) {
  return (
    <Button
      iconName="questionMark"
      intent="neutral"
      outline
      size="sm"
      ariaLabel={t3({ en: "Help", fr: "Aide", pt: "Ajuda" })}
      onClick={() => openComponent({ element: HelpModal, props: { id: p.id } })}
    />
  );
}

function HelpModal(p: AlertComponentProps<{ id: HelpId }, void>) {
  const target = HELP_TARGETS[p.id];
  return (
    <ModalContainer
      width="md"
      title={t3(target.title)}
      onCancel={() => p.close(undefined)}
      cancelLabel={t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
      footer={
        <Button intent="primary" href={getHelpUrl(target)} newTab>
          {t3({ en: "Read more…", fr: "En savoir plus…", pt: "Ler mais…" })}
        </Button>
      }
    >
      <p class="text-base-content text-sm">{t3(target.summary)}</p>
    </ModalContainer>
  );
}
