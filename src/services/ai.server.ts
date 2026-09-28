import Groq from "groq-sdk";
import pLimit from "p-limit";
import { prisma } from "../lib/prisma.server";
import {
  stripQuotedReplies,
  MAX_BODY_CHARS,
} from "../lib/utils.server";
import type { Priority } from "@prisma/client";
import type { EmailMessage } from "./email-provider.server";

/**
 * Constructed lazily, and that is load-bearing rather than a micro-optimisation.
 *
 * `new Groq({ apiKey })` throws when the key is missing, so evaluating it at
 * module scope meant that merely importing this file failed the Docker build:
 * `next build` imports every route module to collect page data with
 * NODE_ENV=production, and `.dockerignore` keeps `.env` out of the image. A
 * build has no business needing a live API key, so the client is created on
 * first use, where a missing key is a real runtime configuration error and gets
 * reported as one by the caller.
 */
let cachedGroq: Groq | null = null;

function groq(): Groq {
  if (!cachedGroq) {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is missing or empty. Summarization cannot run without it.",
      );
    }
    cachedGroq = new Groq({ apiKey });
  }
  return cachedGroq;
}

/**
 * Groq retires models without much notice: `llama-3.3-70b-versatile` was
 * hardcoded here and quietly disappeared from the catalogue, which turned a
 * valid key into a wall of 404s. Keep the model in the environment so the next
 * deprecation is a `.env` edit rather than a code change. Confirm what your key
 * can reach with `GET https://api.groq.com/openai/v1/models`.
 *
 * Read per call rather than captured at import time, so a value set after this
 * module loads is still honoured.
 */
function groqModel(): string {
  return process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
}

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

  const model = groqModel();
  const response = await groq().chat.completions.create({
    model,
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

  // Every outcome is counted. Previously a provider outage looked identical to
  // an empty inbox: each email was swallowed into `summary: null`, nothing was
  // written, and `summarizeEmails` resolved successfully, so the pipeline
  // reported success and no JobFailure was ever recorded. `cached` is tracked
  // separately so that an all-cached run is never mistaken for total failure.
  let succeeded = 0;
  let cached = 0;
  let failed = 0;
  let lastError: unknown = null;

  const tasks = emails.map((email) =>
    limit(async (): Promise<SummarizedEmail> => {
      if (existingIds.has(email.id)) {
        const saved = await prisma.emailSummary.findUnique({
          where: { gmailMessageId: email.id },
        });
        if (saved) {
          cached++;
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
        if (!result) {
          failed++;
          console.error(
            `[ai] ${groqModel()} returned no usable summary for ${email.id} (${email.subject})`,
          );
          return { ...email, summary: null };
        }

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

        succeeded++;
        return { ...email, summary: result };
      } catch (error) {
        failed++;
        lastError = error;
        console.error(
          `[ai] summarization failed for ${email.id} (${email.subject}):`,
          error instanceof Error ? error.message : error,
        );
        return { ...email, summary: null };
      }
    }),
  );

  const summarized = await Promise.all(tasks);

  if (failed > 0 && succeeded === 0 && cached === 0) {
    // Throw so `runDigestPipeline` records a JobFailure and the dashboard can
    // explain itself. A partial batch is fine and stays silent beyond a warning.
    throw Object.assign(
      new Error(
        `All ${failed} email summarization attempts failed${
          lastError instanceof Error ? `: ${lastError.message}` : ""
        }`,
      ),
      { step: "ai-summarization", cause: lastError },
    );
  }

  if (failed > 0) {
    console.warn(
      `[ai] ${failed} of ${emails.length} summaries failed; ${succeeded} saved, ${cached} cached`,
    );
  }

  return summarized;
}