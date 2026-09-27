import { getValidAccessToken } from "../lib/google-auth.server";
import { prisma } from "../lib/prisma.server";
import {
  decodeHtmlEntities,
  stripQuotedReplies,
  MAX_BODY_CHARS,
} from "../lib/utils.server";
import type { EmailMessage, EmailProvider } from "./email-provider.server";

interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: { name: string; value: string }[];
  body: { size: number; data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBody(payload: GmailMessagePart): string | null {
  const queue: GmailMessagePart[] = [payload];
  while (queue.length > 0) {
    const part = queue.shift()!;
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts && part.parts.length > 0) {
      queue.push(...part.parts);
    }
  }
  return null;
}

export class GmailProvider implements EmailProvider {
  async getTodaysEmails(userId: string): Promise<EmailMessage[]> {
    const accessToken = await this.getValidAccessToken(userId);
    return this.fetchMessages(accessToken);
  }

  async getValidAccessToken(userId: string): Promise<string> {
    return getValidAccessToken(userId);
  }

  async sendReply(
    userId: string,
    emailId: string,
    replyText: string,
  ): Promise<void> {
    const summary = await prisma.emailSummary.findUnique({
      where: { gmailMessageId: emailId },
    });
    if (!summary) {
      throw new Error("Email summary not found");
    }

    const accessToken = await this.getValidAccessToken(userId);

    // No In-Reply-To / References header: those must carry real Message-IDs,
    // and EmailSummary does not persist the original message's Message-ID or
    // threadId. Gmail falls back to subject-based threading, which is what
    // the previous (invalid, address-valued) header degraded to anyway.
    const rawMessage = [
      `To: ${summary.sender}`,
      `Subject: Re: ${summary.subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      replyText,
    ].join("\r\n");

    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendBody: { raw: string } = { raw: encodedMessage };

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendBody),
      },
    );

    if (!sendRes.ok) {
      const errorText = await sendRes.text();
      throw new Error(`Gmail API error: ${sendRes.status} ${errorText}`);
    }

    // The `status = SENT` transition is the caller's job, not the provider's,
    // so that Microsoft Graph replies get marked too.
  }

  async getFullBody(userId: string, messageRef: string): Promise<string> {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef)}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) return "";

    const data = (await res.json()) as { payload?: GmailMessagePart };
    if (!data.payload) return "";

    const body = extractBody(data.payload);
    if (!body) return "";

    const stripped = stripQuotedReplies(body);
    return stripped.length > MAX_BODY_CHARS
      ? stripped.slice(-MAX_BODY_CHARS)
      : stripped;
  }

  private async fetchMessages(
    accessToken: string,
  ): Promise<EmailMessage[]> {
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!listRes.ok) {
      const errorText = await listRes.text();
      throw new Error(`Gmail API error: ${listRes.status} ${errorText}`);
    }

    const listData = (await listRes.json()) as {
      messages?: { id: string }[];
    };

    if (!listData.messages) return [];

    return Promise.all(
      listData.messages.map(async (msg) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          },
        );
        if (!msgRes.ok) {
          return {
            id: msg.id,
            threadId: "",
            messageId: "",
            subject: "(error loading)",
            sender: "",
            snippet: "",
            date: "",
          };
        }
        const msgData = (await msgRes.json()) as {
          id: string;
          threadId: string;
          snippet: string;
          payload?: {
            headers?: { name: string; value: string }[];
          };
        };
        const headers = msgData.payload?.headers ?? [];
        const subject = decodeHtmlEntities(
          headers.find((h) => h.name === "Subject")?.value ?? "(no subject)",
        );
        const sender = decodeHtmlEntities(
          headers.find((h) => h.name === "From")?.value ?? "",
        );
        const date = headers.find((h) => h.name === "Date")?.value ?? "";
        const messageId =
          headers.find((h) => h.name === "Message-ID")?.value ?? "";
        return {
          id: msgData.id,
          threadId: msgData.threadId,
          messageId,
          subject,
          sender,
          snippet: decodeHtmlEntities(msgData.snippet ?? ""),
          date,
        };
      }),
    );
  }
}