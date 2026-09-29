/**
 * Sender string parsing, shared by the digest write path and the unsubscribe
 * counter.
 *
 * Deliberately a plain module rather than `.server` so it can be unit tested
 * without a Prisma mock — it is pure string handling, which is where the
 * interesting edge cases live.
 */

/** The bracketed form RFC 5322 allows: `Ada Lovelace <ada@example.com>`. */
const ANGLED = /<([^<>]+)>/;

/**
 * The address out of a `From` header, lowercased, or null if there isn't one.
 *
 * Null rather than a best guess because the caller uses this to group rows by
 * sender, and a wrong-but-non-null key silently splits one person into two
 * counts. Returning null makes those rows simply not contribute.
 *
 * Lowercased because the local part is technically case-sensitive, but every
 * practical provider treats it as case-insensitive and the alternative is
 * `Ada@example.com` and `ada@example.com` counting as two senders.
 */
export function extractSenderAddress(from: string): string | null {
  const value = (from ?? "").trim();
  if (!value) return null;

  const bracketed = ANGLED.exec(value);
  const candidate = (bracketed ? bracketed[1] : value).trim().toLowerCase();
  if (!candidate) return null;

  // A malformed header can leave a display name glued on; take the last token.
  const address = candidate.split(/\s+/).pop() ?? "";

  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  if (address.startsWith("@") || address.endsWith(".")) return null;

  return address;
}

/**
 * The display name, or null when the header only carried an address.
 *
 * Null in the bare-address case on purpose: the banner falls back to the
 * address, and "ada@example.com" presented as somebody's name reads as a bug.
 */
export function extractSenderName(from: string): string | null {
  const value = (from ?? "").trim();
  if (!value) return null;

  const bracketed = ANGLED.exec(value);
  if (!bracketed) return null;

  const name = value.slice(0, bracketed.index).trim().replace(/^"(.*)"$/, "$1");
  return name || null;
}
