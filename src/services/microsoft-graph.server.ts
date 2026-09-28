import { getMicrosoftAccessToken } from "../lib/microsoft-auth.server";
import { currentDayWindow } from "../lib/date.server";
import type { EmailMessage, EmailProvider } from "./email-provider.server";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_EMAILS = 5;

interface GraphEmailAddress {
  name?: string;
  address?: string;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: GraphEmailAddress };
  bodyPreview?: string;
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
}

function formatSender(emailAddress?: GraphEmailAddress): string {
  const address = emailAddress?.address?.trim();
  if (!address) return "";
  const name = emailAddress?.name?.trim();
  return name && name !== address ? `${name} <${address}>` : address;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class MicrosoftGraphProvider implements EmailProvider {
  async getValidAccessToken(userId: string): Promise<string> {
    return getMicrosoftAccessToken(userId);
  }

  async getTodaysEmails(userId: string): Promise<EmailMessage[]> {
    const accessToken = await this.getValidAccessToken(userId);
    const window = currentDayWindow();

    // Graph's receivedDateTime is UTC and is a server-assigned value, so unlike
    // Gmail this can be filtered exactly in the query rather than scanning a
    // wider result set and discarding most of it.
    const params = new URLSearchParams({
      $top: String(MAX_EMAILS),
      $orderby: "receivedDateTime desc",
      $select: "id,conversationId,subject,from,bodyPreview,receivedDateTime",
      $filter: `receivedDateTime ge ${window.start.toISOString()} and receivedDateTime le ${window.end.toISOString()}`,
    });

    const res = await fetch(`${GRAPH_BASE}/me/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Microsoft Graph API error: ${res.status} ${errorText}`);
    }

    const data = (await res.json()) as { value?: GraphMessage[] };

    return (data.value ?? []).map((msg) => ({
      id: msg.id,
      threadId: msg.conversationId ?? "",
      messageId: msg.id,
      subject: msg.subject ?? "(no subject)",
      sender: formatSender(msg.from?.emailAddress),
      snippet: msg.bodyPreview ?? "",
      date: msg.receivedDateTime ?? "",
    }));
  }

  async getFullBody(userId: string, messageRef: string): Promise<string> {
    const accessToken = await this.getValidAccessToken(userId);

    const res = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageRef)}?$select=id,body`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) return "";

    const data = (await res.json()) as GraphMessage;
    const content = data.body?.content ?? "";
    if (data.body?.contentType === "text") return content;
    return stripHtml(content);
  }

  async sendReply(
    userId: string,
    emailId: string,
    replyText: string,
  ): Promise<void> {
    const accessToken = await this.getValidAccessToken(userId);

    const res = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(emailId)}/reply`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            body: { contentType: "Text", content: replyText },
          },
          comment: "",
        }),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Microsoft Graph API error: ${res.status} ${errorText}`);
    }

    // The `status = SENT` transition is the caller's job, not the provider's.
  }
}