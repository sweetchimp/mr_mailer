/**
 * Pure types and prompt-building for the reply-style analyser.
 *
 * Same split as `reply-insights.ts` and `minutes-view.ts`: the arithmetic and
 * the prompt live in a `.ts` module with no Prisma or Groq import, so they can
 * be unit tested directly and so the service can stay a thin persistence shell.
 */

import type { Priority } from "@prisma/client";

/** One reply the user sent, with what the AI had suggested. */
export interface StyleAnalysisSample {
  id: string;
  /** What the AI suggested. */
  suggested: string;
  /** What the user actually sent. */
  sent: string;
  /**
   * The user sent the suggestion unchanged. Stored rather than inferred from a
   * zero diff, so the two cases stay distinguishable after the fact even if the
   * diffing rules change.
   */
  accepted: boolean;
  insertions: number;
  deletions: number;
  modifications: number;
  sentAt: Date;
  /** Subject of the email replied to, if that summary still exists. */
  subject: string | null;
  priority: Priority | null;
  senderAddress: string | null;
}

/** The analyser's conclusion about how this user writes. */
export interface ReplyStyleProfileResult {
  /**
   * Prose instructions for the reply prompt. This is the whole payload: the
   * whole point is to hand a sentence to the summarizer, and a structured set of
   * traits would only be re-serialised into prose at the point of use anyway.
   */
  styleNote: string;
  sampleCount: number;
  acceptedCount: number;
  rewriteCount: number;
}

/**
 * Below this, an analysis is not worth persisting.
 *
 * Three or four replies cannot distinguish a habit from a coincidence, and a
 * confident-sounding note built from them is worse than no note: the reply prompt
 * would defer to a style that may be an artefact of one awkward email. Five is
 * still thin, but it is the point where a signal is more likely than not.
 */
export const MIN_SAMPLES_FOR_STYLE = 5;

/**
 * Per-sample text cap. A long email thread's reply can be thousands of
 * characters, and the model only needs enough to hear register, greeting habit
 * and length. Left unbounded, twenty pasted-forward threads would crowd out
 * every other sample in the window.
 */
const MAX_SAMPLE_CHARS = 1200;

/** Total prompt cap, applied after per-sample truncation. */
const MAX_SAMPLES_IN_PROMPT = 30;

const SYSTEM_PROMPT = `You are analysing a person's own writing so that an email assistant can draft replies in their voice.

You are given pairs of replies. Each pair has a suggestion the assistant drafted and the reply the person actually sent.

Read the pairs and write a short description of how this person writes: their typical length, formality, greeting and sign-off habits, punctuation and formatting, whether they use contractions, how direct or hedged they are, and any recurring phrasing they favour.

Then read the pairs again and identify what the assistant gets wrong about them. Phrase these as corrections to the assistant.

Rules:
- Accepted pairs are the strongest evidence. When a suggestion was sent unchanged, that phrasing and length were right — say what it had right.
- Rewritten pairs are evidence about the difference, not about the whole reply. Work out what the rewrite added or removed, and generalise only from a pattern you see more than once.
- Do not infer traits from a single reply. With a small sample, describe what is observable and do not speculate.
- Do not describe the content or the topics of the emails. Describe the writing.
- Do not produce personality judgements, demographic guesses, or anything about the person beyond how they write. This note is fed straight into a drafting prompt.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{"styleNote": "2-4 sentences of prose instructions for a drafting assistant"}`;

/**
 * Renders the samples for the prompt, newest first, and bounds how much of each
 * kind the model sees.
 *
 * Both kinds are kept, because they say different things. An accepted pair shows
 * the length, greeting and register that were right; a rewrite shows the delta
 * and so shows what to stop doing. Dropping accepted pairs would leave the model
 * with only the failures and a description of what to avoid, which is a note
 * built entirely out of what went wrong.
 *
 * What they must not do is crowd each other out, because the two carry different
 * weight. Accepted pairs are the cheapest signal to over-read — a long run of
 * them invites the model to describe the assistant's voice as the user's — so
 * they are capped at half the window, and the alternation keeps the rewrite
 * evidence from being buried. Rewrites are the ones worth generalising from, so
 * they fill whatever the accepted cap leaves.
 */
export function selectPromptSamples(
  samples: StyleAnalysisSample[],
): StyleAnalysisSample[] {
  const rewritten = samples.filter((sample) => !sample.accepted);
  const accepted = samples.filter((sample) => sample.accepted);

  const acceptedBudget = Math.min(
    accepted.length,
    Math.floor(MAX_SAMPLES_IN_PROMPT / 2),
  );
  // `samples` arrives newest first and filtering preserves that, so the slice is
  // the most recent accepted replies rather than an arbitrary historical subset.
  const selectedAccepted = accepted.slice(0, acceptedBudget);
  const selectedRewritten = rewritten.slice(0, MAX_SAMPLES_IN_PROMPT - selectedAccepted.length);

  return interleave(selectedRewritten, selectedAccepted);
}

/**
 * Alternates two lists, starting with the first, and appends the remainder of
 * the longer one. The point is that the model cannot read a run of fifteen
 * accepted pairs and conclude the user writes the way the assistant does, and
 * cannot reach the end of the prompt to find the rewrites at all.
 */
function interleave(
  primary: StyleAnalysisSample[],
  secondary: StyleAnalysisSample[],
): StyleAnalysisSample[] {
  const out: StyleAnalysisSample[] = [];
  const length = Math.max(primary.length, secondary.length);

  for (let index = 0; index < length; index += 1) {
    if (index < primary.length) out.push(primary[index]);
    if (index < secondary.length) out.push(secondary[index]);
  }

  return out;
}

/** Trims one reply for the prompt, keeping the opening where voice shows. */
function clip(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_SAMPLE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_SAMPLE_CHARS)}…`;
}

function describeSample(sample: StyleAnalysisSample): string {
  const context = [
    sample.subject ? `Subject: ${sample.subject}` : null,
    sample.priority ? `Priority: ${sample.priority}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" | ");

  const verdict = sample.accepted ? "SENT UNCHANGED" : "REWRITTEN";

  return [
    `--- Reply ${sample.id}`,
    context ? context : "Context: (summary no longer available)",
    `Outcome: ${verdict}`,
    `Assistant suggested:\n${clip(sample.suggested)}`,
    `User actually sent:\n${clip(sample.sent)}`,
  ].join("\n");
}

/**
 * Builds the user message. Separated from the service so the exact prompt text
 * is assertable in a test rather than only observable by calling the model.
 */
export function buildStylePrompt(samples: StyleAnalysisSample[]): string {
  const selected = selectPromptSamples(samples);
  const rewritten = selected.filter((sample) => !sample.accepted).length;

  return [
    `Here are ${selected.length} replies this person sent (${selected.length - rewritten} sent unchanged, ${rewritten} rewritten).`,
    "",
    ...selected.map(describeSample),
  ].join("\n");
}

/**
 * Counts outcomes and returns null when there is too little to learn from.
 *
 * Returns null rather than a thin profile so the caller can leave any existing
 * note alone: a user whose history is still growing should keep the profile
 * they already have, not have it replaced by a worse summary of four replies.
 */
export function summarizeStyleSamples(
  samples: StyleAnalysisSample[],
): Pick<ReplyStyleProfileResult, "sampleCount" | "acceptedCount" | "rewriteCount"> | null {
  if (samples.length < MIN_SAMPLES_FOR_STYLE) return null;

  let acceptedCount = 0;
  for (const sample of samples) {
    if (sample.accepted) acceptedCount += 1;
  }

  return {
    sampleCount: samples.length,
    acceptedCount,
    rewriteCount: samples.length - acceptedCount,
  };
}

/**
 * Reads the model's reply. Returns null on anything unusable rather than
 * throwing, so one malformed response cannot wipe a profile that is currently
 * working.
 */
export function parseStyleNote(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    // Trimmed before parsing, not after. A model asked for bare JSON routinely
    // returns it with a trailing newline, and a note silently discarded for that
    // would look identical to a model that had no opinion to give.
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const note = (parsed as { styleNote?: unknown }).styleNote;
  if (typeof note !== "string") return null;

  const trimmed = note.trim();
  // A near-empty note would be injected into the prompt as a near-empty
  // instruction, which is just noise the model has to work around.
  if (trimmed.length < MIN_NOTE_CHARS) return null;

  return trimmed;
}

const MIN_NOTE_CHARS = 40;

/** Caps a note before it is stored, so one runaway generation cannot bloat the row. */
export function clampStyleNote(note: string): string {
  const trimmed = note.trim();
  return trimmed.length > MAX_NOTE_CHARS
    ? `${trimmed.slice(0, MAX_NOTE_CHARS)}…`
    : trimmed;
}

const MAX_NOTE_CHARS = 2000;

export { SYSTEM_PROMPT as STYLE_SYSTEM_PROMPT };
