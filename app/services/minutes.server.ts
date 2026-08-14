import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export interface MinutesResult {
  summaryText: string;
  decisions: string[];
  actionItems: string[];
  nextSteps: string[];
}

const SYSTEM_PROMPT = `You are an expert meeting note-taker. Given rough, unformatted meeting notes, produce clean, structured meeting minutes.

Return a JSON object with exactly these fields:
- summaryText: 2-3 sentences summarizing the meeting's main topic, what was discussed, and the outcome
- decisions: an array of strings, each a key decision made during the meeting. Use an empty array if no decisions were made.
- actionItems: an array of strings, each an action item in the form "Action — Owner" when an owner is mentioned in the notes (e.g., "Finalize Q3 budget — Priya"), or just "Action" when no owner is named
- nextSteps: an array of strings describing next steps or follow-ups. Use an empty array if none.

Rules:
- Base everything only on the notes provided. Do not invent facts, names, owners, or deadlines not present in the notes.
- Preserve names, amounts, dates, and deadlines exactly as they appear.
- Keep each decision and action item concise (one sentence).
- If the notes are empty or too vague to work with, return a summaryText noting the notes were too sparse and empty arrays for decisions, actionItems, and nextSteps.

Return ONLY valid JSON, no markdown fences.`;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export async function generateMinutes(
  rawNotes: string,
  title: string,
  attendees?: string,
): Promise<MinutesResult> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Title: ${title}\nAttendees: ${attendees ?? "Not provided"}\n\nRaw notes:\n${rawNotes}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from AI");
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MinutesResult>;
    return {
      summaryText:
        typeof parsed.summaryText === "string" && parsed.summaryText.trim()
          ? parsed.summaryText.trim()
          : "No summary could be generated from these notes.",
      decisions: asStringArray(parsed.decisions),
      actionItems: asStringArray(parsed.actionItems),
      nextSteps: asStringArray(parsed.nextSteps),
    };
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}
