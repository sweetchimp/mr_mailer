import pLimit from "p-limit";
import { prisma } from "../lib/prisma.server";
import { getGroq, getGroqModel } from "../lib/groq.server";
import { extractSenderAddress } from "../lib/sender";
import {
  stripQuotedReplies,
  MAX_BODY_CHARS,
} from "../lib/utils.server";
import {
  buildSenderHistory,
  describeSenderHistory,
  type SenderHistory,
} from "../lib/sender-history";
import { getReplyStyleNote } from "./reply-style.server";
import { SYSTEM_PROMPT } from "../lib/categorization-prompt";
import type { Priority } from "@prisma/client";
import type { EmailMessage } from "./email-provider.server";

// The Groq client and the model id live in lib/groq.server.ts: both are shared
// with the meeting-minutes generator, and the laziness that keeps `next build`
// working in Docker is explained in full there.
//
// The prompt lives in lib/categorization-prompt.ts so the categorization eval
// script can read it without importing Prisma or the Groq client. There is
// exactly one copy: web and worker both reach it through `summarizeEmails`
// below.

export interface EmailSummaryResult {
  priority: "HIGH" | "MEDIUM" | "LOW";
  summaryText: string;
  suggestedReply: string | null;
  actionRequired: boolean;
}

interface SummarizedEmail extends EmailMessage {
  summary: EmailSummaryResult | null;
}

/**
 * The user's learned writing style, read once per batch.
 *
 * Deliberately its own function rather than a third argument threaded through
 * `summarizeEmail`: the note is a per-user property, so it would be the same
 * string on every call in a digest run and re-reading it per email would be a
 * query per message for one row.
 *
 * A failure here must not fail the digest. Style is an improvement to the
 * drafted reply, not a precondition for triaging the inbox, so this swallows its
 * own errors and returns null, which the caller omits from the prompt entirely.
 */
async function loadStyleNote(
  userId: string,
): Promise<string | null> {
  try {
    return await getReplyStyleNote(userId);
  } catch (error) {
    console.warn(
      `[ai] style note unavailable for user ${userId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * One email, one model call. Exported so a script can classify a single
 * message with the *real* prompt and the *real* model — a copy of this
 * function would be free to drift from the one the digest uses, and an eval
 * built on that copy would be measuring a prompt nobody ships.
 *
 * The eval script does not call it: it has to run without a database, and
 * this module pulls Prisma in through the digest pipeline, so the eval
 * transcribes the request shape instead. The prompt is the part that must not
 * drift, and it does not — both sides read it from lib/categorization-prompt.
 *
 * Returns null rather than throwing on an unusable response, so a caller
 * classifying many emails can decide for itself whether one bad reply should
 * fail the batch. `summarizeEmails` does exactly that.
 */
export async function summarizeEmail(
  email: EmailMessage,
  senderNote: string | null,
  styleNote: string | null,
): Promise<EmailSummaryResult | null> {
  const rawBody = email.body || email.snippet;
  const stripped = stripQuotedReplies(rawBody);
  const content = stripped.length > MAX_BODY_CHARS
    ? stripped.slice(-MAX_BODY_CHARS)
    : stripped;

  const header = [`Subject: ${email.subject}`, `From: ${email.sender}`];
  // Omitted entirely when there is no history: telling the model "no history"
  // is noise that invites it to invent a reason for a classification.
  if (senderNote) header.push(senderNote);
  // Also omitted when absent, for the same reason. Present only when a
  // background analysis has actually built a profile, and placed last so it
  // reads as the most specific input rather than a fact about the email.
  if (styleNote) header.push(`How this user writes: ${styleNote}`);

  const model = getGroqModel();
  const response = await getGroq().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.3,
    // `max_completion_tokens`, not `max_tokens`, for the same reason
    // minutes.server.ts uses it: the default model is a reasoning model and
    // reasoning draws from this budget too. This prompt asks for a priority
    // call under several competing rules, so it reasons longer than the old
    // one did — long enough that 512 truncated the reply and Groq rejected it
    // as invalid JSON, which surfaced as an email with no summary at all rather
    // than as an error anyone would read. 2048 makes the cap a non-issue.
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${header.join("\n")}\n\n${content}` },
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

/**
 * Per-sender history for the batch, in two queries rather than one per email.
 *
 * `groupBy` returns aggregate counts — at most `addresses × priorities ×
 * statuses` rows — instead of every historical message, so a digest run stays
 * two round-trips however large the inbox or the archive grows.
 */
async function loadSenderHistory(
  userId: string,
  emails: EmailMessage[],
): Promise<Map<string, SenderHistory>> {
  const addresses = [
    ...new Set(
      emails
        .map((email) => extractSenderAddress(email.sender))
        .filter((address): address is string => address !== null),
    ),
  ];

  if (addresses.length === 0) return new Map();

  const [grouped, preferences] = await Promise.all([
    prisma.emailSummary.groupBy({
      by: ["senderAddress", "priority", "status"],
      where: { userId, senderAddress: { in: addresses } },
      _count: { _all: true },
    }),
    prisma.senderPreference.findMany({
      where: { userId, senderAddress: { in: addresses } },
      select: { senderAddress: true, lowDismissals: true },
    }),
  ]);

  return buildSenderHistory(grouped, preferences);
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

  // Only genuinely new mail needs a prior; cached rows never reach the model.
  const [senderHistory, styleNote] = await Promise.all([
    loadSenderHistory(
      userId,
      emails.filter((email) => !existingIds.has(email.id)),
    ),
    loadStyleNote(userId),
  ]);

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
        const senderAddress = extractSenderAddress(email.sender);
        const history = senderAddress
          ? senderHistory.get(senderAddress)
          : undefined;
        const result = await summarizeEmail(
          email,
          history ? describeSenderHistory(history) : null,
          styleNote,
        );
        if (!result) {
          failed++;
          console.error(
            `[ai] ${getGroqModel()} returned no usable summary for ${email.id} (${email.subject})`,
          );
          return { ...email, summary: null };
        }

        await prisma.emailSummary.upsert({
          where: { gmailMessageId: email.id },
          create: {
            userId,
            gmailMessageId: email.id,
            sender: email.sender,
            // Grouping senders needs a stable key; `sender` is a display string
            // the sender chooses and varies between messages from one person.
            senderAddress: extractSenderAddress(email.sender),
            subject: email.subject,
            priority: result.priority as Priority,
            summaryText: result.summaryText,
            suggestedReply: result.suggestedReply,
            // The digest pipeline already fetched the full body in order to
            // summarize it and then dropped it, so storing it costs nothing.
            // `getFullBody` returns plain text, never markup: the Gmail
            // provider strips HTML when a message has no text/plain part, and
            // Graph strips it too. That matters because this column is later
            // rendered to the user.
            bodyText: email.body ?? null,
          },
          update: {
            senderAddress: extractSenderAddress(email.sender),
            priority: result.priority as Priority,
            summaryText: result.summaryText,
            suggestedReply: result.suggestedReply,
            // Only fill it in, never clear it. An update is a re-digest, and the
            // original body does not change between two passes over the same
            // message — so a null body from a cached re-run must not overwrite
            // text a previous pass already stored.
            ...(email.body ? { bodyText: email.body } : {}),
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