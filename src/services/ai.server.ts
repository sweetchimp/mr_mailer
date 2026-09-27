import Groq from "groq-sdk";
import pLimit from "p-limit";
import { prisma } from "../lib/prisma.server";
import {
  stripQuotedReplies,
  MAX_BODY_CHARS,
} from "../lib/utils.server";
import type { Priority } from "@prisma/client";
import type { EmailMessage } from "./email-provider.server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

interface EmailSummaryResult {
  priority: "HIGH" | "MEDIUM" | "LOW";
  summaryText: string;
  suggestedReply: string | null;
  actionRequired: boolean;
}

interface SummarizedEmail extends EmailMessage {
  summary: EmailSummaryResult | null;
}

async function summarizeEmail(
  email: EmailMessage,
): Promise<EmailSummaryResult | null> {
  const rawBody = email.body || email.snippet;
  const stripped = stripQuotedReplies(rawBody);
  const content = stripped.length > MAX_BODY_CHARS
    ? stripped.slice(-MAX_BODY_CHARS)
    : stripped;

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 512,
    messages: [
      {
        role: "system",
        content: `You are an email assistant. Analyze the email and return a JSON object with exactly these fields:

- priority: "HIGH" if the email demands action or has a deadline, "MEDIUM" if it needs attention but isn't urgent, "LOW" if it's FYI or promotional
- summaryText: 1-2 sentences capturing the specific purpose and key details of the email. Mention names, dates, amounts, or action items — not vague generalities
- suggestedReply: A reply the recipient could actually send. Match the sender's tone — formal for business/professional emails, casual for personal ones. Reference specific details from the email (names, dates, requests) rather than generic acknowledgments. Keep it concise for simple emails (2-3 sentences for a confirmation) and more thorough for complex ones (up to 100 words for a detailed question). Sound like a competent person typing, not corporate boilerplate. If no reply is needed, return null
- actionRequired: true if the email needs a response, a decision, or has a deadline; false for FYIs, newsletters, and automated notifications

Return ONLY valid JSON, no markdown fences.`,
      },
      {
        role: "user",
        content: `Subject: ${email.subject}\nFrom: ${email.sender}\n\n${content}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as EmailSummaryResult;
    if (!["HIGH", "MEDIUM", "LOW"].includes(parsed.priority)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function summarizeEmails(
  userId: string,
  emails: EmailMessage[],
): Promise<SummarizedEmail[]> {
  const limit = pLimit(5);

  const existingSummaries = await prisma.emailSummary.findMany({
    where: { userId },
    select: { gmailMessageId: true },
  });
  const existingIds = new Set(existingSummaries.map((s) => s.gmailMessageId));

  const tasks = emails.map((email) =>
    limit(async (): Promise<SummarizedEmail> => {
      if (existingIds.has(email.id)) {
        const saved = await prisma.emailSummary.findUnique({
          where: { gmailMessageId: email.id },
        });
        if (saved) {
          return {
            ...email,
            summary: {
              priority: saved.priority as EmailSummaryResult["priority"],
              summaryText: saved.summaryText,
              suggestedReply: saved.suggestedReply,
              actionRequired: saved.status !== "DISMISSED",
            },
          };
        }
      }

      try {
        const result = await summarizeEmail(email);
        if (!result) return { ...email, summary: null };

        await prisma.emailSummary.upsert({
          where: { gmailMessageId: email.id },
          create: {
            userId,
            gmailMessageId: email.id,
            sender: email.sender,
            subject: email.subject,
            priority: result.priority as Priority,
            summaryText: result.summaryText,
            suggestedReply: result.suggestedReply,
          },
          update: {
            priority: result.priority as Priority,
            summaryText: result.summaryText,
            suggestedReply: result.suggestedReply,
          },
        });

        return { ...email, summary: result };
      } catch {
        return { ...email, summary: null };
      }
    }),
  );

  return Promise.all(tasks);
}