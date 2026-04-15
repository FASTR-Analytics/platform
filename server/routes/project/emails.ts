import { Hono } from "hono";
import { _FEEDBACK_EMAIL_RECIPIENTS } from "lib";
import { _INSTANCE_ID, _SEND_GRID_API } from "../../exposed_env_vars.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesEmails = new Hono();

type SendEmailOptions = {
  to: string;
  subject: string;
  plainText: string;
  html: string;
  from?: { email: string; name: string };
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: { content: string; filename: string; mimeType: string }[];
};

async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, plainText, html, from, replyTo, cc, bcc, attachments } = options;
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${_SEND_GRID_API}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
            ...(cc && cc.length > 0 ? { cc: cc.map((e) => ({ email: e })) } : {}),
            ...(bcc && bcc.length > 0 ? { bcc: bcc.map((e) => ({ email: e })) } : {}),
          },
        ],
        from: from ?? { email: "noreply@fastr-analytics.org", name: "FASTR Analytics Platform" },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        subject,
        content: [
          { type: "text/plain", value: plainText },
          { type: "text/html", value: html },
        ],
        ...(attachments && attachments.length > 0
          ? {
              attachments: attachments.map((a) => ({
                content: a.content,
                filename: a.filename,
                type: a.mimeType,
                disposition: "attachment",
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      console.error(`SendGrid error for ${to}: ${res.status} ${error}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Network error sending to ${to}:`, error);
    return false;
  }
}

defineRoute(
  routesEmails,
  "sendSlideDeckEmail",
  requireProjectPermission("can_view_slide_decks"),
  log("sendSlideDeckEmail"),
  async (c, { body }) => {
    const { recipients, message, attachment } = body;

    const userEmail = c.var.globalUser.email;

    const plainText = `${message}\n\n---\nThis email was sent via FASTR Analytics on behalf of ${userEmail}.`;

    const html = `
<div style="font-family: sans-serif; color: #333;">
  <p>${message.replace(/\n/g, "<br>")}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    This email was sent via <strong>FASTR Analytics</strong> on behalf of ${userEmail}.
  </p>
</div>`.trim();

    const failed: string[] = [];

    for (const recipient of recipients) {
      const ok = await sendEmail({
        to: recipient,
        subject: "Slide Deck from FASTR Analytics",
        plainText,
        html,
        attachments: [{ content: attachment.content, filename: attachment.filename, mimeType: "application/pdf" }],
      });
      if (!ok) failed.push(recipient);
    }

    if (failed.length > 0) {
      return c.json({
        success: true,
        data: { sent: false, failedRecipients: failed },
      });
    }

    return c.json({ success: true, data: { sent: true } });
  },
);

defineRoute(
  routesEmails,
  "sendHelpEmail",
  requireGlobalPermission(),
  log("sendFeedbackEmail"),
  async (c, { body }) => {
    const { feedbackType, description, projectLabel, images } = body;
    const userEmail = c.var.globalUser.email;

    const typeLabel = feedbackType === "bug" ? "Bug Report" : "Suggestion";
    const projectLine = projectLabel ? ` (Project: ${projectLabel})` : "";
    const projectHtmlLine = projectLabel
      ? `<p><strong>Project:</strong> ${projectLabel}</p>`
      : "";

    const userPlainText =
      feedbackType === "bug"
        ? `Thank you for reporting this bug. We have received your report and will look into it. We will contact you if we have any further questions.\n\nYour report:\n${description}`
        : `Thank you for your suggestion. We have received it and will take it into consideration. We will contact you if we have any further questions.\n\nYour suggestion:\n${description}`;

    const userHtmlBody =
      feedbackType === "bug"
        ? `<p>Thank you for reporting this bug. We have received your report and will look into it. We will contact you if we have any further questions.</p>`
        : `<p>Thank you for your suggestion. We have received it and will take it into consideration. We will contact you if we have any further questions.</p>`;

    const userHtml = `
<div style="font-family: sans-serif; color: #333;">
  ${userHtmlBody}
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;"><strong>Your submission:</strong><br>${description.replace(/\n/g, "<br>")}</p>
</div>`.trim();

    const internalPlainText = `New ${typeLabel} from ${userEmail}${projectLine} (Instance: ${_INSTANCE_ID})\n\n${description}`;

    const internalHtml = `
<div style="font-family: sans-serif; color: #333;">
  <p><strong>Type:</strong> ${typeLabel}</p>
  <p><strong>From:</strong> ${userEmail}</p>
  ${projectHtmlLine}
  <p><strong>Instance:</strong> ${_INSTANCE_ID}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p><strong>Description:</strong></p>
  <p>${description.replace(/\n/g, "<br>")}</p>
</div>`.trim();

    await sendEmail({ to: userEmail, subject: `We received your ${typeLabel.toLowerCase()}`, plainText: userPlainText, html: userHtml });

    for (const recipient of _FEEDBACK_EMAIL_RECIPIENTS) {
      await sendEmail({
        to: recipient,
        subject: `[FASTR] New ${typeLabel} from ${userEmail}`,
        plainText: internalPlainText,
        html: internalHtml,
        replyTo: userEmail,
        attachments: images,
      });
    }

    return c.json({ success: true, data: { sent: true } });
  },
);
