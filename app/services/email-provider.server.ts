import { prisma } from "../lib/prisma.server";
import { GmailProvider } from "./gmail.server";
import { MicrosoftGraphProvider } from "./microsoft-graph.server";

export interface EmailMessage {
  id: string;
  threadId: string;
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
  getFullBody(userId: string, messageId: string): Promise<string>;
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
