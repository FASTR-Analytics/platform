import { t3, TC } from "lib";
import {
  Button,
  EditorComponentProps,
  ModalContainer,
  StateHolderFormError,
  Table,
  type TableColumn,
  TextArea,
  toPct0,
  toPct1,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { exportSlideDeckAsPdfBase64 } from "~/export_report/export_slide_deck_as_pdf_base64";
import { serverActions } from "~/server_actions";

type UserRow = { email: string };

export function ShareSlideDeck(
  p: EditorComponentProps<
    {
      projectId: string;
      deckId: string;
      deckLabel: string;
      userEmails: string[];
    },
    undefined
  >,
) {
  const [selectedKeys, setSelectedKeys] = createSignal<Set<string>>(new Set());
  const [additionalEmails, setAdditionalEmails] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [pct, setPct] = createSignal<number>(0);
  const [err, setErr] = createSignal("");
  const [sent, setSent] = createSignal(false);

  const userRows = (): UserRow[] => p.userEmails.map((email: string) => ({ email }));

  const parsedAdditionalEmails = () =>
    additionalEmails()
      .replaceAll(",", ":::")
      .replaceAll(";", ":::")
      .replaceAll("\n", ":::")
      .split(":::")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

  const allRecipients = () => {
    const fromTable = Array.from(selectedKeys());
    const fromTextarea = parsedAdditionalEmails();
    return [...new Set([...fromTable, ...fromTextarea])];
  };

  const columns: TableColumn<UserRow>[] = [
    {
      key: "email",
      header: t3(TC.email),
      sortable: true,
    },
  ];

  async function handleSend() {
    const recipients = allRecipients();
    if (recipients.length === 0) {
      setErr(t3({ en: "Select at least one recipient", fr: "Sélectionnez au moins un destinataire" }));
      return;
    }

    setErr("");
    setPct(0.02);

    const pdfResult = await exportSlideDeckAsPdfBase64(
      p.projectId,
      p.deckId,
      (v) => setPct(v * 0.8),
    );

    if (pdfResult.success === false) {
      setErr(pdfResult.err);
      setPct(0);
      return;
    }

    setPct(0.85);

    const res = await serverActions.sendSlideDeckEmail({
      projectId: p.projectId,
      recipients,
      message: message(),
      attachment: {
        content: pdfResult.data,
        filename: `${p.deckLabel}.pdf`,
      },
    });

    setPct(1);

    if (res.success && res.data.sent) {
      setSent(true);
    } else {
      const failedList = res.success && res.data.failedRecipients
        ? res.data.failedRecipients.join(", ")
        : "";
      setErr(
        t3({
          en: `Failed to send${failedList ? ` to: ${failedList}` : ""}`,
          fr: `Échec de l'envoi${failedList ? ` à : ${failedList}` : ""}`,
        }),
      );
      setPct(0);
    }
  }

  return (
    <ModalContainer
      title={t3({ en: "Share slide deck", fr: "Partager la présentation" })}
      width="md"
      leftButtons={
        sent()
          ? // eslint-disable-next-line jsx-key
            [
              <Button onClick={() => p.close(undefined)} intent="success" iconName="check">
                {t3(TC.done)}
              </Button>,
            ]
          : pct() > 0
            ? undefined
            : // eslint-disable-next-line jsx-key
              [
                <Button onClick={handleSend} intent="success" iconName="arrowRight">
                  {t3({ en: "Send", fr: "Envoyer" })} ({allRecipients().length})
                </Button>,
                <Button onClick={() => p.close(undefined)} intent="neutral" iconName="x">
                  {t3(TC.cancel)}
                </Button>,
              ]
      }
    >
      <Show when={sent()}>
        <div class="text-success text-center py-4">
          {t3({ en: "Email sent successfully!", fr: "Email envoyé avec succès !" })}
        </div>
      </Show>
      <Show when={!sent()}>
        <div class="ui-spy-sm">
          <label class="ui-label">
            {t3({ en: "Select users", fr: "Sélectionner des utilisateurs" })}
          </label>
          <div style={{ "max-height": "200px", overflow: "auto" }}>
            <Table
              data={userRows()}
              columns={columns}
              keyField="email"
              defaultSort={{ key: "email", direction: "asc" }}
              noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur" })}
              selectedKeys={selectedKeys}
              setSelectedKeys={setSelectedKeys}
              selectionLabel={t3({ en: "user", fr: "utilisateur" })}
              paddingY="compact"
            />
          </div>
        </div>
        <div class="ui-spy-sm">
          <TextArea
            label={t3({ en: "Additional emails", fr: "Emails supplémentaires" })}
            value={additionalEmails()}
            onChange={setAdditionalEmails}
            placeholder={t3({ en: "Add emails separated by comma, semicolon, or line break", fr: "Ajouter des emails séparés par virgule, point-virgule ou saut de ligne" })}
            fullWidth
            height="80px"
          />
        </div>
        <Show when={allRecipients().length > 0}>
          <div class="ui-spy-sm">
            <label class="ui-label">
              {t3({ en: "Recipients", fr: "Destinataires" })} ({allRecipients().length})
            </label>
            <div class="pt-1">
              <For each={allRecipients()}>
                {(email: string) => <div class="list-item list-inside text-xs">{email}</div>}
              </For>
            </div>
          </div>
        </Show>
        <div class="ui-spy-sm">
          <TextArea
            label={t3({ en: "Message", fr: "Message" })}
            value={message()}
            onChange={setMessage}
            placeholder={t3({ en: "Optional message to include in the email", fr: "Message facultatif à inclure dans l'email" })}
            fullWidth
            height="80px"
          />
        </div>
        <Show when={pct() > 0}>
          <div class="ui-spy-sm">
            <div class="bg-base-300 h-8 w-full">
              <div
                class="bg-primary h-full"
                style={{ width: toPct1(pct()) }}
              ></div>
            </div>
            <div class="text-center">{toPct0(pct())}</div>
          </div>
        </Show>
        <Show when={pct() === 0 && err()}>
          <StateHolderFormError state={{ status: "error", err: err() }} />
        </Show>
      </Show>
    </ModalContainer>
  );
}
