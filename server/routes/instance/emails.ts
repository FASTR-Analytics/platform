import { Hono } from "hono";
import { _FEEDBACK_EMAIL_RECIPIENTS } from "../../auth/h_users.ts";
import {
  _DAILY_EMAIL_LIMIT,
  _INSTANCE_ID,
  _SEND_GRID_API,
  _SERVER_VERSION,
} from "../../exposed_env_vars.ts";
import {
  queueFeedbackPlan,
  REPORTER_LOG_HOURS,
  REPORTER_LOG_LIMIT,
  type SupportAddition,
} from "../../utils/feedback_planner.ts";
import { getRecentUserRequests } from "../../db/instance/user_logs.ts";
import { USER_PERMISSIONS } from "lib";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";
import {
  claimDailyEmailSends,
  DAILY_EMAIL_LIMIT_REACHED,
} from "../../db/instance/users.ts";

export const routesEmails = new Hono();

// The only SendGrid egress. sendSlideDeckEmail is a product surface, so it
// sits behind `GUARD.approved` like every other product read; the PDF is
// client-rendered and the recipients on offer are the instance directory.

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
  const { to, subject, plainText, html, from, replyTo, cc, bcc, attachments } =
    options;
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
            ...(cc && cc.length > 0
              ? { cc: cc.map((e) => ({ email: e })) }
              : {}),
            ...(bcc && bcc.length > 0
              ? { bcc: bcc.map((e) => ({ email: e })) }
              : {}),
          },
        ],
        from: from ??
          {
            email: "noreply@fastr-analytics.org",
            name: "FASTR Analytics Platform",
          },
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
  log("sendSlideDeckEmail"),
  async (c, { body }) => {
    const { recipients, message, attachment } = body;

    const userEmail = c.var.globalUser.email;
    if (
      !(await claimDailyEmailSends(
        c.var.mainDb,
        userEmail,
        recipients.length,
        _DAILY_EMAIL_LIMIT,
      ))
    ) {
      return c.json({ success: false, err: DAILY_EMAIL_LIMIT_REACHED });
    }

    const plainText =
      `${message}\n\n---\nThis email was sent via FASTR Analytics on behalf of ${userEmail}.`;

    const html = `
<div style="font-family: sans-serif; color: #333;">
  <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    This email was sent via <strong>FASTR Analytics</strong> on behalf of ${
      escapeHtml(userEmail)
    }.
  </p>
</div>`.trim();

    const failed: string[] = [];

    for (const recipient of recipients) {
      const ok = await sendEmail({
        to: recipient,
        subject: "Slide Deck from FASTR Analytics",
        plainText,
        html,
        attachments: [{
          content: attachment.content,
          filename: attachment.filename,
          mimeType: "application/pdf",
        }],
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
  "sendReportEmail",
  log("sendReportEmail"),
  async (c, { body }) => {
    const { recipients, message, reportLabel, attachment } = body;

    const userEmail = c.var.globalUser.email;
    if (
      !(await claimDailyEmailSends(
        c.var.mainDb,
        userEmail,
        recipients.length,
        _DAILY_EMAIL_LIMIT,
      ))
    ) {
      return c.json({ success: false, err: DAILY_EMAIL_LIMIT_REACHED });
    }

    const plainText =
      `${message}\n\n---\nThis email was sent via FASTR Analytics on behalf of ${userEmail}.`;

    const html = `
<div style="font-family: sans-serif; color: #333;">
  <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    This email was sent via <strong>FASTR Analytics</strong> on behalf of ${
      escapeHtml(userEmail)
    }.
  </p>
</div>`.trim();

    const failed: string[] = [];

    for (const recipient of recipients) {
      const ok = await sendEmail({
        to: recipient,
        subject: `${reportLabel} — report from FASTR Analytics`,
        plainText,
        html,
        attachments: [{
          content: attachment.content,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
        }],
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
  log("sendHelpEmail"),
  async (c, { body }) => {
    const { feedbackType, description, context, images } = body;
    const userEmail = c.var.globalUser.email;

    const typeLabel = {
      bug: "Bug Report",
      suggestion: "Suggestion",
      help: "Help Request",
    }[feedbackType];
    const contextLine = context ? ` (Context: ${context})` : "";
    const contextHtmlLine = context
      ? `<p><strong>Context:</strong> ${escapeHtml(context)}</p>`
      : "";

    const ackSentence = {
      bug:
        "Thank you for reporting this bug. We have received your report and will look into it. We will contact you if we have any further questions.",
      suggestion:
        "Thank you for your suggestion. We have received it and will take it into consideration. We will contact you if we have any further questions.",
      help:
        "Thank you for your request. We have received it and will get back to you as soon as we can.",
    }[feedbackType];
    const submissionNoun = {
      bug: "report",
      suggestion: "suggestion",
      help: "request",
    }[feedbackType];

    const userPlainText =
      `${ackSentence}\n\nYour ${submissionNoun}:\n${description}`;

    const userHtmlBody = `<p>${ackSentence}</p>`;

    const userHtml = `
<div style="font-family: sans-serif; color: #333;">
  ${userHtmlBody}
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;"><strong>Your submission:</strong><br>${
      escapeHtml(description).replace(/\n/g, "<br>")
    }</p>
</div>`.trim();

    const internalPlainText =
      `New ${typeLabel} from ${userEmail}${contextLine} (Instance: ${_INSTANCE_ID})\n\n${description}`;

    // `extraHtml` is the feedback planner's "Claude's first look" section;
    // without it the email is exactly the raw report.
    const buildInternalHtml = (extraHtml = "") =>
      `
<div style="font-family: sans-serif; color: #333;">
  <p><strong>Type:</strong> ${typeLabel}</p>
  <p><strong>From:</strong> ${escapeHtml(userEmail)}</p>
  ${contextHtmlLine}
  <p><strong>Instance:</strong> ${_INSTANCE_ID}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p><strong>Description:</strong></p>
  <p>${escapeHtml(description).replace(/\n/g, "<br>")}</p>${extraHtml}
</div>`.trim();

    const sendToSupport = async (extra?: SupportAddition) => {
      let deliveredCount = 0;
      for (const recipient of _FEEDBACK_EMAIL_RECIPIENTS) {
        const ok = await sendEmail({
          to: recipient,
          subject: `[FASTR] New ${typeLabel} from ${userEmail}`,
          plainText: extra
            ? `${internalPlainText}\n\n${extra.plainText}`
            : internalPlainText,
          html: buildInternalHtml(extra?.html),
          replyTo: userEmail,
          attachments: images,
        });
        if (ok) deliveredCount++;
      }
      return deliveredCount > 0;
    };

    // A bug or suggestion the planner accepts has its support email held
    // until the plan is done, so the planner sends it (with Claude's note)
    // and this route cannot report its delivery. Everything else goes now.
    let heldForPlan = false;
    if (feedbackType !== "help") {
      const user = c.var.globalUser;
      const recent = await getRecentUserRequests(
        c.var.mainDb,
        userEmail,
        new Date(Date.now() - REPORTER_LOG_HOURS * 3_600_000),
        REPORTER_LOG_LIMIT,
      );
      heldForPlan = queueFeedbackPlan(
        {
          feedbackType,
          description,
          userEmail,
          instanceId: _INSTANCE_ID,
          serverVersion: _SERVER_VERSION,
          imageCount: images?.length ?? 0,
          reporter: {
            isGlobalAdmin: user.isGlobalAdmin,
            permissions: USER_PERMISSIONS.filter((k) =>
              user.thisUserPermissions[k]
            ),
            allScopes: user.scopeAccess.all,
            recentRequests: recent.success ? recent.data : undefined,
          },
        },
        sendEmail,
        sendToSupport,
      );
    }

    if (!heldForPlan && !(await sendToSupport())) {
      return c.json({
        success: false,
        err: "Your feedback could not be delivered. Please try again later.",
      });
    }

    await sendEmail({
      to: userEmail,
      subject: `We received your ${typeLabel.toLowerCase()}`,
      plainText: userPlainText,
      html: userHtml,
    });

    return c.json({ success: true, data: { sent: true } });
  },
);
