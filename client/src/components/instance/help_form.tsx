import { t3, TC } from "lib";
import {
  Button,
  ModalContainer,
  type AlertComponentProps,
} from "panther";

export function HelpForm(p: AlertComponentProps<{}, undefined>) {
  return (
    <ModalContainer
      title={t3({ en: "Help", fr: "Aide" })}
      width="lg"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button onClick={() => p.close(undefined)} iconName="x">
            {t3(TC.done)}
          </Button>,
        ]
      }
    >
      <div class="text-sm">
        {/* Help content goes here */}
      </div>
    </ModalContainer>
  );
}
