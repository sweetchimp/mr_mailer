import { prisma } from "../lib/prisma.server";
import { GmailProvider } from "./gmail.server";
import { MicrosoftGraphProvider } from "./microsoft-graph.server";

export interface EmailMessage {
  /** The provider's own message identifier — Gmail API id / Graph id. */
  id: string;
  threadId: string;
  /**
   * The RFC 5322 `Message-ID` header (Gmail) — an opaque value like
   * `<CAF=abc@mail.gmail.com>`. It is NOT accepted by any provider API and
   * must never be passed to `getFullBody`; use `id` for that.
   */
  messageId: string;
  subject: string;
  sender: string;
  snippet: string;
  date: string;
  body?: string;
}

export interface EmailProvider {
  getTodaysEmails(userId: string): Promise<EmailMessage[]>;
  sendReply(userId: string, emailId: string, replyText: string): Promise<void>;
  /** `messageRef` must be the `EmailMessage.id` returned by `getTodaysEmails`. */
  getFullBody(userId: string, messageRef: string): Promise<string>;
  getValidAccessToken(userId: string): Promise<string>;
}

export async function getEmailProvider(userId: string): Promise<EmailProvider> {
  const token = await prisma.oAuthToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { provider: true },
  });

  if (token?.provider === "MICROSOFT") {
    return new MicrosoftGraphProvider();
  }
  return new GmailProvider();
}