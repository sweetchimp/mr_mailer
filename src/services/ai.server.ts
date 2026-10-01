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
import type { Priority } from "@prisma/client";
import type { EmailMessage } from "./email-provider.server";

// The Groq client and the model id live in lib/groq.server.ts: both are shared
// with the meeting-minutes generator, and the laziness that keeps `next build`
// working in Docker is explained in full there.

interface EmailSummaryResult {
  priority: "HIGH" | "MEDIUM" | "LOW";
  summaryText: string;
  suggestedReply: string | null;
  actionRequired: boolean;
}

interface SummarizedEmail extends EmailMessage {
  summary: EmailSummaryResult | null;
}

const SYSTEM_PROMPT = `You are an email triage assistant for a busy professional. Analyze the email and return a JSON object with exactly these fields: priority, summaryText, suggestedReply, actionRequired.

Choose priority with these rules, applied in order:

HIGH — needs a reply. Use it only when the email is workplace-related AND urgent: a permission or approval request (time off, budget, access, sign-off), an escalation or a dispute that needs resolving, mail from a senior person or a significant external organisation or stakeholder, a request bound to a deadline, or anything that needs a decision or an explicit response. Personal, social, promotional, and automated mail is never HIGH, however urgent it sounds.
MEDIUM — worth a glance. Workplace-related, but not time-critical: status updates, mildly relevant FYIs, and requests that can wait.
LOW — FYI. Newsletters, automated notifications, promotional content, and informational-only messages.

If the email sits between two levels, choose the lower one rather than reading urgency into it.

- summaryText: 1-2 sentences capturing the specific purpose and key details of the email. Mention names, dates, amounts, or action items — not vague generalities.
- suggestedReply: A reply the recipient could actually send. Match the sender's tone — formal for business/professional emails, casual for personal ones. Reference specific details (names, dates, requests) rather than generic acknowledgments. Keep it concise for simple emails (2-3 sentences for a confirmation) and more thorough for complex ones (up to 100 words for a detailed question). Sound like a competent person typing, not corporate boilerplate. If no reply is needed, return null.
- actionRequired: true only for HIGH and MEDIUM emails that need a response, a decision, or carry a deadline; false for FYIs, newsletters, and automated notifications.

When a sender history note is supplied, treat it as a prior, not a verdict: it records how this user classified this sender before. Use it to break ties and steady borderline calls, but if the content of the current email is clearly more or less urgent than the history suggests, follow the content.

When a note about how this user writes is supplied, it describes their own previous replies. Apply it to suggestedReply ONLY. Never let it affect priority, summaryText, or actionRequired: a note about someone's tone is not evidence about how urgent an email is, and letting it leak into triage would mean a stylistic quirk could cause an email to be mis-prioritised. If the note conflicts with what the email clearly calls for, follow the email.

Return ONLY valid JSON, no markdown fences.`;

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

async function summarizeEmail(
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
    max_tokens: 512,
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