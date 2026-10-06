/**
 * Categorization eval — 25 labelled emails against the real Groq model.
 *
 * NOT part of the test suite, deliberately. `vitest.config.ts` only includes
 * files matching `src` + any `*.test.ts`, so nothing under `scripts/` can be
 * collected and `npm run test` stays offline with no configuration change.
 *
 * It imports the shipped prompt from `src/lib/categorization-prompt.ts` rather
 * than copying it. A copy would be free to drift from the one the digest
 * actually uses, and this would then measure a prompt nobody runs.
 *
 * Usage:
 *   npx tsx scripts/eval-categorization.ts
 *   npx tsx scripts/eval-categorization.ts --verbose   per-case detail
 *   npx tsx scripts/eval-categorization.ts --explain   print the rationale per label
 *   npx tsx scripts/eval-categorization.ts --rounds 5   prompt iteration cap
 *
 * Methodology, because it changes what the numbers mean:
 *   - Every case runs 3 times. A case passes only if all 3 agree with the
 *     label. A case that changes bucket between runs is reported UNSTABLE and
 *     counts as a failure: an inbox whose triage flickers is not a triage system.
 *   - Any non-urgent case landing in HIGH is printed FIRST, before the pass
 *     table, because that error puts a promotion on the dashboard under
 *     "Needs a reply" — the mistake a user notices and distrusts fastest.
 */

import "dotenv/config";
import {
  LEGACY_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from "../src/lib/categorization-prompt";
import { EVAL_CASES, type EvalCase } from "./eval-cases";
import type { Priority } from "@prisma/client";
import { APIConnectionError } from "groq-sdk";
import { getGroq, getGroqModel } from "../src/lib/groq.server";

// Deliberately NOT `summarizeEmail`: it imports Prisma through the digest
// pipeline, and an eval that needs a database configured before it can run is an
// eval nobody runs. The prompt, the model and the request shape are all the
// real ones — `classify` below is a transcription of `summarizeEmail`'s call,
// and the two must be changed together. The reason the *prompt* is not copied
// is the one that matters: it would drift from what ships.

const RUNS_PER_CASE = 3;
const MAX_ROUNDS = 5;
const BUCKETS: Priority[] = ["HIGH", "MEDIUM", "LOW"];

const verbose = process.argv.includes("--verbose");
const explain = process.argv.includes("--explain");

function argNumber(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const maxRounds = argNumber("--rounds", MAX_ROUNDS);

/**
 * `--only id,id` — run a subset of cases.
 *
 * The point is iteration cost. A full round is 75 calls; when the last round
 * failed on four cases, the only useful question is whether those four still
 * fail, which is 12 calls. Without this, tightening the prompt after every
 * observation costs five times more than the information is worth.
 *
 * An unknown id is an error rather than a no-op. Silently matching three of four
 * requested ids would look like a clean run while quietly skipping the case
 * that was the point.
 */
function selectedCases(): EvalCase[] {
  const index = process.argv.indexOf("--only");
  if (index === -1) return EVAL_CASES;

  const requested = (process.argv[index + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const unknown = requested.filter(
    (id) => !EVAL_CASES.some((c) => c.id === id),
  );
  if (unknown.length > 0) {
    throw new Error(
      `unknown case id(s): ${unknown.join(", ")}\navailable:\n  ${EVAL_CASES.map((c) => c.id).join("\n  ")}`,
    );
  }

  // Kept in EVAL_CASES order rather than the order given, so two runs with the
  // same set in different order print the same report.
  return EVAL_CASES.filter((c) => requested.includes(c.id));
}

const cases = selectedCases();

interface Attempt {
  bucket: Priority | "PARSE_ERROR";
  summaryText: string;
}

interface CaseResult {
  testCase: EvalCase;
  attempts: Attempt[];
  buckets: string[];
  stable: boolean;
  passed: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries the failures that have nothing to do with the prompt.
 *
 * Without this, one 503 from Groq — which the provider itself calls "currently
 * over capacity", a routine occurrence on a popular open model — throws out
 * every case already classified in the round. The eval reports on
 * classification, so an infrastructure blip has to be retried rather than
 * recorded as a wrong answer, or mistaken for one.
 *
 * A malformed or non-JSON reply is NOT retried: that is a real result, produced
 * by the prompt under test.
 */
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
/** Ceiling on any single wait, including one derived from `retry-after`. */
const MAX_BACKOFF_MS = 60_000;

/**
 * Groq's own advice for how long to wait, in ms.
 *
 * Worth reading rather than inventing a backoff. A daily token limit returns
 * `retry-after: 233`, and a fixed 15s ladder spends three attempts inside a wait
 * that was always going to fail — burning requests and finishing slower than
 * just asking the caller to run this again later.
 */
function serverRetryAfter(error: unknown): number | null {
  const headers = (error as { headers?: Headers })?.headers;
  if (!headers || typeof headers.get !== "function") return null;

  const seconds = Number(headers.get("retry-after"));
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  // Headers can carry a window in ms as well as a date; Groq uses both.
  const ms = Number(headers.get("x-ratelimit-reset-tokens"));
  if (Number.isFinite(ms) && ms > 0) return ms;

  return null;
}

/** True when no amount of waiting inside this run will help. */
function isDailyQuota(error: unknown): boolean {
  const message =
    (error as { error?: { message?: string } })?.error?.message ??
    (error as Error)?.message ??
    "";
  return /tokens per day|\bTPD\b|daily limit/i.test(message);
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // A connection error has no HTTP status — `APIConnectionError` carries
      // `status: undefined` — so a plain status check would rethrow it on the
      // first attempt and end the run. That is backwards: a DNS blip or a
      // reset socket is the most transient failure there is, and this is what
      // the retry exists for. A missing GROQ_API_KEY also throws with no
      // status, but it is an `Error`, not an `APIConnectionError`, so it still
      // fails immediately rather than backing off against a config typo.
      const status = (error as { status?: number }).status;
      const transient =
        status === undefined
          ? error instanceof APIConnectionError
          : TRANSIENT_STATUS.has(status);
      if (!transient || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      // A daily quota will not clear by waiting a minute. Say so plainly and
      // stop, instead of retrying four times against a limit that resets in
      // hours — and do not record it as a classification failure.
      if (isDailyQuota(error)) {
        const wait = serverRetryAfter(error);
        const calls = cases.length * RUNS_PER_CASE;
        const approxK = Math.round((calls * 1800) / 1000);
        const scope =
          cases.length === EVAL_CASES.length
            ? `a full round of ${cases.length} cases`
            : `this ${cases.length}-case subset`;
        console.error(
          `\nGroq daily token quota exhausted${wait ? ` (resets in ${Math.round(wait / 1000)}s)` : ""}.` +
            `\n${calls} calls x ~1,800 tokens ~= ${approxK}k tokens for ${scope}.` +
            `\nRe-run later, or narrow with --only. Nothing below this line is a result.`,
        );
        throw error;
      }

      // 15s base, doubling, so a saturated provider gets real breathing room
      // instead of several calls inside the same outage.
      const advised = serverRetryAfter(error);
      const backoff = Math.min(
        advised ?? 15_000 * 2 ** (attempt - 1),
        MAX_BACKOFF_MS,
      );
      console.log(
        `  retrying ${label}: ${status} (attempt ${attempt}/${MAX_ATTEMPTS}), waiting ${Math.round(backoff / 1000)}s`,
      );
      await sleep(backoff);
    }
  }
}

/**
 * One classification. Deliberately mirrors `summarizeEmail`'s request shape and
 * its validation, but calls the client directly so importing this file does not
 * require a live database. The prompt and the model are the real ones.
 */
async function classify(testCase: EvalCase): Promise<Attempt> {
  const response = await withRetry(testCase.id, () =>
    getGroq().chat.completions.create({
      model: getGroqModel(),
      response_format: { type: "json_object" },
      temperature: 0.3,
      // Matches ai.server.ts. `max_completion_tokens`, not `max_tokens`:
      // reasoning tokens draw from this budget on a reasoning model, and this
      // prompt's competing rules make it reason for 200-400 tokens before
      // answering. Capped too low, the reply truncates and Groq rejects it as
      // invalid JSON — an infrastructure-shaped failure caused by the prompt.
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Subject: ${testCase.subject}\nFrom: ${testCase.sender}\n\n${testCase.body}`,
        },
      ],
    }),
  );

  const raw = response.choices[0]?.message?.content;
  if (!raw) return { bucket: "PARSE_ERROR", summaryText: "" };

  try {
    const parsed = JSON.parse(raw) as {
      priority?: string;
      summaryText?: string;
    };
    if (!parsed.priority || !BUCKETS.includes(parsed.priority as Priority)) {
      return { bucket: "PARSE_ERROR", summaryText: parsed.summaryText ?? "" };
    }
    return {
      bucket: parsed.priority as Priority,
      summaryText: parsed.summaryText ?? "",
    };
  } catch {
    return { bucket: "PARSE_ERROR", summaryText: "" };
  }
}

/**
 * Reads the real `prompt_tokens` the provider counted for a prompt.
 *
 * There is no tokenizer in this project and adding one for a report would be the
 * wrong trade, so this asks the API instead of estimating: the number is the one
 * the model actually saw rather than an approximation of it.
 *
 * Measured three times and reported as the median. The provider has returned
 * both 1297 and 2321 for the same unchanged prompt on consecutive runs, and a
 * single reading would print whichever it happened to get — making the
 * headline "prompt grew by N%" a coin flip. The median costs four extra calls
 * across the two prompts and turns an outlier into the middle value rather
 * than the answer.
 */
async function countPromptTokens(systemPrompt: string): Promise<number | null> {
  const readings: number[] = [];

  for (let reading = 0; reading < 3; reading++) {
    try {
      // No `response_format` here, unlike `classify`. The JSON mode makes Groq
      // validate the completion and reject an empty one, and a truncated token
      // count call always produces an empty completion — so asking for JSON
      // mode here fails for a reason that has nothing to do with counting.
      const response = await withRetry("token-count", () =>
        getGroq().chat.completions.create({
          model: getGroqModel(),
          temperature: 0,
          max_tokens: 16,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Subject: x\nFrom: y@z.example\n\nx" },
          ],
        }),
      );
      const tokens = response.usage?.prompt_tokens;
      if (typeof tokens === "number") readings.push(tokens);
    } catch {
      // A token count is a nice-to-have. Losing one degrades the report;
      // failing the whole eval over it would be the wrong priority.
    }
  }

  if (readings.length === 0) return null;
  readings.sort((a, b) => a - b);
  return readings[Math.floor(readings.length / 2)];
}

async function runRound(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    const attempts: Attempt[] = [];
    for (let run = 0; run < RUNS_PER_CASE; run++) {
      attempts.push(await classify(testCase));
      if (run < RUNS_PER_CASE - 1) await sleep(150);
    }

    const buckets = attempts.map((a) => a.bucket);
    // Uniqueness over the raw bucket list, so three identical answers is one
    // unique value and a flicker is two.
    const stable = new Set(buckets).size === 1;
    const passed = stable && buckets.every((b) => b === testCase.expected);

    results.push({ testCase, attempts, buckets, stable, passed });
  }

  return results;
}

function reportHighLeak(results: CaseResult[]): void {
  const leaks = results.filter(
    (r) => r.testCase.nonUrgent && r.buckets.includes("HIGH"),
  );

  console.log("=".repeat(78));
  if (leaks.length === 0) {
    console.log("HIGH LEAKAGE: none. No non-urgent email reached HIGH.");
  } else {
    console.log(
      `HIGH LEAKAGE: ${leaks.length} non-urgent case(s) reached HIGH — the`,
    );
    console.log(
      "dashboard would be showing these under \"Needs a reply\". Promotions first.",
    );
    const promos = leaks.filter((r) => r.testCase.expected !== "HIGH");
    const others = leaks.filter((r) => r.testCase.expected === "HIGH");
    if (promos.length > 0) {
      console.log("\n  Promotions / marketing:");
      for (const leak of promos) {
        console.log(
          `    ${leak.testCase.id.padEnd(30)} expected ${leak.testCase.expected.padEnd(6)} got ${leak.buckets.join(", ")}`,
        );
        console.log(`      from:    ${leak.testCase.sender}`);
        console.log(`      subject: ${leak.testCase.subject}`);
      }
    }
    if (others.length > 0) {
      console.log("\n  Other non-urgent:");
      for (const leak of others) {
        console.log(
          `    ${leak.testCase.id.padEnd(30)} expected ${leak.testCase.expected.padEnd(6)} got ${leak.buckets.join(", ")}`,
        );
        console.log(`      subject: ${leak.testCase.subject}`);
      }
    }
  }
  console.log("=".repeat(78));
}

function reportTable(results: CaseResult[]): void {
  const failed = results.filter((r) => !r.passed);

  console.log(
    `\n${results.length - failed.length}/${results.length} cases passed ` +
      `(${RUNS_PER_CASE} runs each; unstable counts as failed)\n`,
  );

  for (const result of results) {
    const mark = result.passed ? "PASS" : result.stable ? "FAIL" : "UNSTABLE";
    const seen = result.buckets.join(", ");
    const expected = result.testCase.expected;
    const ok = result.passed;
    console.log(
      `  ${mark.padEnd(8)} ${result.testCase.id.padEnd(34)} expected ${expected.padEnd(6)} got ${seen}${ok ? "" : "   <-- "}`,
    );

    if (verbose && !result.passed) {
      console.log(`      sender:   ${result.testCase.sender}`);
      console.log(`      subject:  ${result.testCase.subject}`);
      console.log(`      expected: ${expected} — ${result.testCase.rationale}`);
      for (const attempt of result.attempts) {
        console.log(`      got:      ${attempt.bucket}`);
        if (attempt.summaryText) {
          console.log(`      summary:  ${attempt.summaryText}`);
        }
      }
    }
  }

  if (explain) {
    console.log("\nRationale per label:");
    for (const result of results) {
      console.log(
        `  ${result.testCase.id.padEnd(34)} ${result.testCase.expected.padEnd(6)} ${result.testCase.rationale}`,
      );
    }
  }
}

async function main(): Promise<void> {
  console.log(`model: ${getGroqModel()}`);
  console.log(`cases: ${cases.length}, runs each: ${RUNS_PER_CASE}`);
  console.log(`calls this round: ${cases.length * RUNS_PER_CASE}`);
  if (cases.length !== EVAL_CASES.length) {
    console.log(
      `NOTE: subset of ${EVAL_CASES.length}. A pass here is not a pass for the set.`,
    );
  }

  console.log("\n--- prompt size (provider-counted) ---");
  const beforeTokens = await countPromptTokens(LEGACY_SYSTEM_PROMPT);
  const afterTokens = await countPromptTokens(SYSTEM_PROMPT);
  console.log(`  before (LEGACY_SYSTEM_PROMPT): ${beforeTokens ?? "unavailable"} tokens`);
  console.log(`  after  (SYSTEM_PROMPT):        ${afterTokens ?? "unavailable"} tokens`);
  if (beforeTokens !== null && afterTokens !== null) {
    const delta = afterTokens - beforeTokens;
    const pct = ((delta / beforeTokens) * 100).toFixed(1);
    console.log(
      `  delta: ${delta >= 0 ? "+" : ""}${delta} tokens (${delta >= 0 ? "+" : ""}${pct}%)`,
    );
  }

  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n${"#".repeat(78)}\n# ROUND ${round} of ${maxRounds}\n${"#".repeat(78)}`);

    const results = await runRound();

    reportHighLeak(results);
    reportTable(results);

    const failed = results.filter((r) => !r.passed);
    if (failed.length === 0) {
      console.log(`\nAll ${results.length} cases passed in ${RUNS_PER_CASE} runs each.`);
      return;
    }

    console.log(`\n${failed.length} case(s) need attention:`);
    for (const result of failed) {
      const kind = result.stable ? "wrong bucket" : "unstable across runs";
      console.log(
        `  ${result.testCase.id} (${kind}): expected ${result.testCase.expected}, got ${result.buckets.join(", ")}`,
      );
    }

    if (round === maxRounds) {
      console.log(
        `\nRound cap of ${maxRounds} reached with ${failed.length} case(s) still failing.`,
      );
      console.log(
        "This is the honest stopping point — report these rather than bending the",
      );
      console.log(
        "prompt to match labels that may themselves need review (see --explain).",
      );
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((error) => {
  console.error("eval failed:", error);
  // Exit rather than set the flag: the Groq client can still hold an open
  // handle after a connection failure, and `exitCode` alone then leaves the
  // process sitting there until something else kills it — which reads as a
  // hang instead of the error already printed above.
  process.exit(1);
});