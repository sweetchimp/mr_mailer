import { getEmailProvider } from "./email-provider.server";
import { summarizeEmails } from "./ai.server";

export interface DigestResult {
  emails: (import("./email-provider.server").EmailMessage & {
    summary: {
      priority: string;
      summaryText: string;
      suggestedReply: string | null;
      actionRequired: boolean;
    } | null;
  })[];
  stats: { high: number; medium: number; low: number };
}

export async function runDigestPipeline(
  userId: string,
): Promise<DigestResult> {
  const provider = await getEmailProvider(userId);

  let emails: import("./email-provider.server").EmailMessage[];
  try {
    emails = await provider.getTodaysEmails(userId);
  } catch (cause) {
    const original = cause instanceof Error ? cause.message : String(cause);
    throw Object.assign(new Error(`Failed to fetch emails: ${original}`), {
      step: "email-fetch",
      cause,
    });
  }

  const emailsWithBodies = await Promise.all(
    emails.map(async (email) => {
      if (email.body) return email;
      try {
        const body = await provider.getFullBody(userId, email.messageId);
        return { ...email, body };
      } catch {
        return email;
      }
    }),
  );

  let summarizedEmails: DigestResult["emails"];
  try {
    summarizedEmails = await summarizeEmails(userId, emailsWithBodies);
  } catch (cause) {
    const original = cause instanceof Error ? cause.message : String(cause);
    throw Object.assign(new Error(`Failed to summarize emails: ${original}`), {
      step: "ai-summarization",
      cause,
    });
  }

  const stats = { high: 0, medium: 0, low: 0 };
  for (const email of summarizedEmails) {
    if (email.summary?.priority === "HIGH") stats.high++;
    else if (email.summary?.priority === "MEDIUM") stats.medium++;
    else if (email.summary?.priority === "LOW") stats.low++;
  }

  return { emails: summarizedEmails, stats };
}
