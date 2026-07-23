import { GmailProvider } from "./gmail.server";

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
}

export async function getEmailProvider(userId: string): Promise<EmailProvider> {
  return new GmailProvider();
}
