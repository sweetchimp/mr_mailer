const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#x27;": "'",
  "&#x2F;": "/",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&[#\w]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

export const MAX_BODY_CHARS = 4000;

export function stripQuotedReplies(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(
    /-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i,
    "",
  );
  cleaned = cleaned.replace(
    /On\s+.+wrote:[\s\S]*$/i,
    "",
  );
  cleaned = cleaned.replace(/^>.*$/gm, "");
  cleaned = cleaned.replace(/_{3,}\s*Forwarded message\s*_{3,}[\s\S]*$/i, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * Reduces an HTML body to readable plain text.
 *
 * Needed because the two providers disagree: Graph returns raw HTML for
 * `contentType: "html"` mail, and Gmail's `extractBody` only accepts a
 * `text/plain` MIME part — so an HTML-only message has no plain part to find,
 * and without this fallback "view the original" stays empty for most
 * newsletters and every marketing email.
 *
 * This is not a full HTML parser and does not need to be. It handles the
 * structure that actually appears in mail: block boundaries become newlines,
 * tags are dropped, and the entities that survive `decodeHtmlEntities` are
 * decoded. Script, style and head bodies are removed rather than unwrapped,
 * because their contents are code — and a `<script>` body is text that reads
 * like an instruction to a summarizer, which is the last thing to hand a prompt.
 *
 * Output is plain text and is only ever rendered as text, so there is no
 * sanitiser needed downstream.
 */
export function stripHtml(html: string): string {
  let cleaned = html;

  cleaned = cleaned.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  cleaned = cleaned.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  cleaned = cleaned.replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, "\n");
  cleaned = cleaned.replace(/<\s*\/\s*\w+\s*>/g, "");
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  cleaned = decodeHtmlEntities(cleaned);

  // Non-breaking spaces survive entity decoding and would stop every space
  // after them from being collapsible.
  cleaned = cleaned.replace(/[   ]/g, " ");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}