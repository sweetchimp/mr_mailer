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