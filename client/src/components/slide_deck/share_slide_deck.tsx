import { emailRecipientsSchema, t3, TC } from "lib";
import {
  Button,
  EditorComponentProps,
  getTruncatedString,
  ModalContainer,
  StateHolderFormError,
  Table,
  type TableColumn,
  TextArea,
  toPct0,
  toPct1,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { exportSlideDeckAsPdfBase64 } from "~/exports/export_slide_deck_as_pdf_base64";
import { serverActions } from "~/server_actions";

type UserRow = { email: string };

export function ShareSlideDeck(
  p: EditorComponentProps<
    {
      deckId: string;
      deckLabel: string;
      // The INSTANCE roster: with the project tier gone there is no narrower
      // recipient list to offer (D2).
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

  const userRows = (): UserRow[] =>
    p.userEmails.map((email: string) => ({ email }));

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
      setErr(
        t3({
          en: "Select at least one recipient",
          fr: "Sélectionnez au moins un destinataire",
          pt: "Selecione pelo menos um destinatário",
        }),
      );
      return;
    }

    // Before the export, not after: the route enforces the same schema, and a
    // rejection there costs a full deck render and sends to nobody.
    const check = emailRecipientsSchema.safeParse(recipients);
    if (!check.success) {
      const invalid = check.error.issues
        .map((i) => (typeof i.path[0] === "number" ? recipients[i.path[0]] : undefined))
        .filter((v): v is string => v !== undefined);
      setErr(
        invalid.length > 0
          ? t3({
              en: `Not a valid email address: ${invalid.join(", ")}`,
              fr: `Adresse email non valide : ${invalid.join(", ")}`,
              pt: `Endereço de email inválido: ${invalid.join(", ")}`,
            })
          : t3({
              en: `Select at most 50 recipients (currently ${recipients.length})`,
              fr: `Sélectionnez au maximum 50 destinataires (actuellement ${recipients.length})`,
              pt: `Selecione no máximo 50 destinatários (atualmente ${recipients.length})`,
            }),
      );
      return;
    }

    setErr("");
    setPct(0.02);

    const pdfResult = await exportSlideDeckAsPdfBase64(p.deckId, (v: number) =>
      setPct(v * 0.8),
    );

    if (pdfResult.success === false) {
      setErr(pdfResult.err);
      setPct(0);
      return;
    }

    setPct(0.85);

    const res = await serverActions.sendSlideDeckEmail({
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
      const failedList = res.success
        ? (res.data.failedRecipients?.join(", ") ?? "")
        : res.err;
      setErr(
        t3({
          en: `Failed to send${failedList ? ` to: ${failedList}` : ""}`,
          fr: `Échec de l'envoi${failedList ? ` à : ${failedList}` : ""}`,
          pt: `Falha ao enviar${failedList ? ` para: ${failedList}` : ""}`,
        }),
      );
      setPct(0);
    }
  }

  return (
    <ModalContainer
      title={t3({ en: "Share slide deck", fr: "Partager la présentation", pt: "Partilhar apresentação" })}
      width="md"
      leftButtons={
        sent()
          ? // eslint-disable-next-line jsx-key
            [
              <Button
                onClick={() => p.close(undefined)}
                intent="success"
                iconName="check"
              >
                {t3(TC.done)}
              </Button>,
            ]
          : pct() > 0
            ? undefined
            : // eslint-disable-next-line jsx-key
              [
                <Button
                  onClick={handleSend}
                  intent="success"
                  iconName="arrowRight"
                >
                  {t3({ en: "Send", fr: "Envoyer", pt: "Enviar" })} ({allRecipients().length})
                </Button>,
                <Button
                  onClick={() => p.close(undefined)}
                  intent="neutral"
                  iconName="x"
                >
                  {t3(TC.cancel)}
                </Button>,
              ]
      }
    >
      <Show when={sent()}>
        <div class="text-success py-4 text-center">
          {t3({
            en: "Email sent successfully!",
            fr: "Email envoyé avec succès !",
            pt: "Email enviado com sucesso!",
          })}
        </div>
      </Show>
      <Show when={!sent()}>
        {/* <div class="ui-spy-sm"> */}
        {/* <label class="ui-label"></label>
          <div style={{ "max-height": "200px", overflow: "auto" }}> */}
        <div class="h-56">
          <Table
            data={userRows()}
            columns={columns}
            keyField="email"
            defaultSort={{ key: "email", direction: "asc" }}
            noRowsMessage={t3({ en: "No users", fr: "Aucun utilisateur", pt: "Sem utilizadores" })}
            selectedKeys={selectedKeys}
            setSelectedKeys={setSelectedKeys}
            selectionLabel={t3({ en: "user", fr: "utilisateur", pt: "utilizador" })}
            paddingY="compact"
            fitTableToAvailableHeight
          />
        </div>
        {/* </div>
        </div> */}
        <TextArea
          label={t3({
            en: "Additional emails",
            fr: "Emails supplémentaires",
            pt: "Emails adicionais",
          })}
          value={additionalEmails()}
          onChange={setAdditionalEmails}
          placeholder={t3({
            en: "Add emails separated by comma, semicolon, or line break",
            fr: "Ajouter des emails séparés par virgule, point-virgule ou saut de ligne",
            pt: "Adicione emails separados por vírgula, ponto e vírgula ou quebra de linha",
          })}
          fullWidth
          height="80px"
        />
        <Show when={allRecipients().length > 0}>
          <div class="">
            <label class="ui-label">
              {t3({ en: "Recipients", fr: "Destinataires", pt: "Destinatários" })} (
              {allRecipients().length})
            </label>
            <div class="pt-1 text-xs">
              {getTruncatedString(allRecipients()?.join(", "), 200)}
            </div>
          </div>
        </Show>
        <TextArea
          label={t3({ en: "Message", fr: "Message", pt: "Mensagem" })}
          value={message()}
          onChange={setMessage}
          placeholder={t3({
            en: "Optional message to include in the email",
            fr: "Message facultatif à inclure dans l'email",
            pt: "Mensagem opcional a incluir no email",
          })}
          fullWidth
          height="80px"
        />
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
