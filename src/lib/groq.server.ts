import Groq from "groq-sdk";

/**
 * The single Groq client, shared by every feature that calls the model.
 *
 * Constructed lazily, and that is load-bearing rather than a micro-optimisation.
 *
 * `new Groq({ apiKey })` throws when the key is missing, so evaluating it at
 * module scope meant that merely importing this file failed the Docker build:
 * `next build` imports every route module to collect page data with
 * NODE_ENV=production, and `.dockerignore` keeps `.env` out of the image. A
 * build has no business needing a live API key, so the client is created on
 * first use, where a missing key is a real runtime configuration error and gets
 * reported as one by the caller.
 *
 * This started life as two private functions inside `services/ai.server.ts`.
 * Meeting minutes needs the same client, and duplicating it would have meant
 * copying this comment along with it — and then forgetting to copy the fix the
 * next time the reason for laziness changes.
 */
let cachedGroq: Groq | null = null;

export function getGroq(): Groq {
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
 * hardcoded in `ai.server.ts` and quietly disappeared from the catalogue, which
 * turned a valid key into a wall of 404s. Keep the model in the environment so
 * the next deprecation is a `.env` edit rather than a code change. Confirm what
 * your key can reach with `GET https://api.groq.com/openai/v1/models`.
 *
 * Read per call rather than captured at import time, so a value set after this
 * module loads is still honoured.
 */
export function getGroqModel(): string {
  return process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
}
