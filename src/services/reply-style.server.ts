import { prisma } from "../lib/prisma.server";
import { getGroq, getGroqModel } from "../lib/groq.server";
import { getRepliesForStyleAnalysis } from "./reply-feedback.server";
import {
  buildStylePrompt,
  clampStyleNote,
  parseStyleNote,
  summarizeStyleSamples,
  STYLE_SYSTEM_PROMPT,
} from "../lib/reply-style";

/**
 * Maintains a per-user profile of how that user writes, so suggested replies
 * stop sounding like a stranger wrote them.
 *
 * Runs unattended on a schedule. There is no button and no page that triggers
 * it, which is the point: the interesting signal is the user's replies over
 * time, and a model that only adapts after someone goes looking at a diff log
 * will not keep up with someone who replies forty times a week and never opens
 * the page.
 *
 * What the profile is allowed to affect is deliberately narrow. It is injected
 * into the reply-suggestion prompt and nowhere else — it must not influence how
 * incoming mail is triaged, so a poor profile can make a drafted reply read
 * oddly but can never cause an email to be mis-prioritised.
 */
export async function analyzeReplyStyle(
  userId: string,
): Promise<{ updated: boolean; sampleCount: number; reason?: string }> {
  const samples = await getRepliesForStyleAnalysis(userId);
  const counts = summarizeStyleSamples(samples);

  // Too little history to say anything. The existing profile is left in place
  // rather than deleted: a user who had twenty replies and then reinstalled
  // should not lose a working profile to a thin window.
  if (!counts) {
    return {
      updated: false,
      sampleCount: samples.length,
      reason: "not enough replies yet",
    };
  }

  const response = await getGroq().chat.completions.create({
    model: getGroqModel(),
    response_format: { type: "json_object" },
    // Lower than the summarizer's 0.3. This task has a right answer that is
    // already in the samples, so a colder reading is a more faithful one; a
    // creative interpretation of someone's writing is just a plausible guess.
    temperature: 0.2,
    // `max_completion_tokens` rather than `max_tokens`, for the reason documented
    // in minutes.server.ts: the default model is a reasoning model and draws
    // reasoning tokens from this same budget. A truncated response fails to
    // parse and the run is wasted.
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: STYLE_SYSTEM_PROMPT },
      { role: "user", content: buildStylePrompt(samples) },
    ],
  });

  const styleNote = parseStyleNote(response.choices[0]?.message?.content);
  if (!styleNote) {
    // A malformed generation is a bad night, not a reason to blank a profile
    // that was working yesterday. The next scheduled run retries.
    return {
      updated: false,
      sampleCount: counts.sampleCount,
      reason: "model returned an unusable note",
    };
  }

  await prisma.replyStyleProfile.upsert({
    where: { userId },
    create: {
      userId,
      styleNote: clampStyleNote(styleNote),
      sampleCount: counts.sampleCount,
      acceptedCount: counts.acceptedCount,
      rewriteCount: counts.rewriteCount,
    },
    update: {
      styleNote: clampStyleNote(styleNote),
      sampleCount: counts.sampleCount,
      acceptedCount: counts.acceptedCount,
      rewriteCount: counts.rewriteCount,
      analyzedAt: new Date(),
    },
  });

  return {
    updated: true,
    sampleCount: counts.sampleCount,
  };
}

/**
 * The user's style note, for injection into the reply prompt.
 *
 * Returns null when there is no profile, and the caller must omit the note
 * entirely in that case: telling the model "the user has no style on record"
 * invites it to invent one.
 */
export async function getReplyStyleNote(userId: string): Promise<string | null> {
  const profile = await prisma.replyStyleProfile.findUnique({
    where: { userId },
    select: { styleNote: true },
  });

  return profile?.styleNote ?? null;
}

/** The stored profile, for the read-only insights page. */
export async function getReplyStyleProfile(userId: string): Promise<{
  styleNote: string;
  sampleCount: number;
  acceptedCount: number;
  rewriteCount: number;
  analyzedAt: Date;
} | null> {
  const profile = await prisma.replyStyleProfile.findUnique({
    where: { userId },
    select: {
      styleNote: true,
      sampleCount: true,
      acceptedCount: true,
      rewriteCount: true,
      analyzedAt: true,
    },
  });

  return profile;
}
