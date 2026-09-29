/**
 * View models and parsers for meeting minutes.
 *
 * `MeetingMinutes` stores `decisions`, `actionItems`, and `nextSteps` as
 * `TEXT` holding a JSON-encoded array — the columns predate this feature and
 * the squashed init migration was not going to be re-cut for it. So every read
 * has to go back through a parser, and the parsers have to be forgiving:
 *
 *  - The model is asked for `actionItems` as objects, but a row written by an
 *    older build (or by hand, or by a future migration) can hold bare strings.
 *  - A `TEXT` column is not a schema, so `null`, `""`, `"[]"`, a JSON object
 *    where an array was expected, and members of the wrong type are all
 *    reachable states, not hypotheticals.
 *
 * Every parser returns `[]` rather than throwing. The alternative — letting a
 * malformed row 500 the detail page — means one bad row makes a user's whole
 * minutes history unreachable.
 *
 * Deliberately *not* a `.server` module: it holds no server-only state, and
 * keeping it isomorphic means its parsers can be unit-tested without standing
 * up the prisma and groq mocks that `services/minutes.server.ts` needs.
 */

/** One action item, with the owner split out so the UI can style it separately. */
export interface ActionItem {
  task: string;
  /** Null when the notes named no owner. Never inferred. */
  owner: string | null;
}

/** What the AI generator returns, before anything is persisted. */
export interface MinutesResult {
  summaryText: string;
  decisions: string[];
  actionItems: ActionItem[];
  nextSteps: string[];
}

/** Slim projection for the `/minutes` list — never loads the parsed arrays. */
export interface MinutesSummary {
  id: string;
  title: string;
  /** ISO-8601; `MeetingMinutes` has no separate meeting date, so this is it. */
  date: string;
  attendees: string | null;
}

/** Everything the detail page renders. */
export interface MinutesDetail extends MinutesSummary {
  summaryText: string;
  decisions: string[];
  actionItems: ActionItem[];
  nextSteps: string[];
  rawNotes: string;
}

function trimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/**
 * Last-resort reader for a column that turns out not to be JSON at all.
 *
 * Accepts newline-separated text with optional leading bullets, which is how
 * these columns read when someone has edited them in a database client.
 */
function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Reads a JSON array of plain strings.
 *
 * The newline fallback applies only when `JSON.parse` *fails*. A column that
 * parses but holds something other than an array is a shape problem, and
 * line-splitting it would render the raw JSON — `{"decisions":"Ship it"}` —
 * as if it were a decision someone had written.
 */
export function parseStringList(raw: string | null): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return splitLines(raw);
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.map(trimmed).filter((item): item is string => item !== null);
}

/**
 * Reads the action-items column.
 *
 * A bare string entry means an older row that predates the `{ task, owner }`
 * contract, so it is read as an unowned task rather than dropped — losing a
 * real action item because of a shape change would be worse than rendering it
 * without a name.
 */
export function parseActionItems(raw: string | null): ActionItem[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return splitLines(raw).map((task) => ({ task, owner: null }));
  }

  if (!Array.isArray(parsed)) return [];

  const items: ActionItem[] = [];
  for (const entry of parsed) {
    if (typeof entry === "string") {
      const task = trimmed(entry);
      if (task) items.push({ task, owner: null });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const task = trimmed(record.task);
    if (!task) continue;
    items.push({ task, owner: trimmed(record.owner) });
  }
  return items;
}

/**
 * Splits the attendees column into individual names.
 *
 * Accepts commas or newlines because the form's placeholder invites the latter
 * and pasted calendar attendee lists are almost always the former. Duplicates
 * are dropped case-insensitively — the same person typed twice in a notes
 * field is a typo, not two attendees.
 */
export function splitAttendees(raw: string | null): string[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
