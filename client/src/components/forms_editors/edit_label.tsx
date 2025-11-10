import { APIResponseNoData, APIResponseWithData, isFrench } from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Input,
  timActionForm,
  TextArea,
} from "panther";
import { Match, Switch, createSignal } from "solid-js";
import { t } from "lib";

export function EditLabelForm(
  p: AlertComponentProps<
    {
      headerText: string;
      fieldLabel?: string;
      existingLabel: string;
      mutateFunc: (
        newLabel: string,
      ) => Promise<APIResponseNoData | APIResponseWithData<unknown>>;
      silentFetch?: () => Promise<void>;
      textArea?: boolean;
    },
    "NEEDS_UPDATE"
  >,
) {
  const [tempLabel, setTempLabel] = createSignal<string>(p.existingLabel);

  const save = p.silentFetch
    ? timActionForm(
        async (e: MouseEvent) => {
          e.preventDefault();
          const goodLabel = tempLabel().trim();
          if (!goodLabel) {
            return { success: false, err: t("You must enter a name") };
          }
          return p.mutateFunc(goodLabel);
        },
        p.silentFetch,
        () => p.close("NEEDS_UPDATE"),
      )
    : timActionForm(
        async (e: MouseEvent) => {
          e.preventDefault();
          const goodLabel = tempLabel().trim();
          if (!goodLabel) {
            return { success: false, err: t("You must enter a name") };
          }
          return p.mutateFunc(goodLabel);
        },
        () => p.close("NEEDS_UPDATE"),
      );

  return (
    <AlertFormHolder
      formId="edit-label"
      header={p.headerText}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      french={isFrench()}
    >
      <Switch>
        <Match when={!p.textArea}>
          <Input
            label={p.fieldLabel}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            autoFocus
          />
        </Match>
        <Match when={true}>
          <TextArea
            label={p.fieldLabel}
            value={tempLabel()}
            onChange={setTempLabel}
            fullWidth
            height="300px"
            autoFocus
          />
        </Match>
      </Switch>
    </AlertFormHolder>
  );
}
