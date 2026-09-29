"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma.server";
import { requireUser } from "@/lib/current-session.server";
import { generateMinutes } from "@/services/minutes.server";

export interface CreateMinutesState {
  error?: string;
}

/** Named caps, matching the `MAX_REPLY_CHARS` style in dashboard/actions.ts. */
const MAX_TITLE_CHARS = 200;
const MAX_ATTENDEE_CHARS = 2_000;
const MAX_NOTES_CHARS = 20_000;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Generates structured minutes from raw notes and saves them.
 *
 * Uses `useActionState` rather than a plain `<form action>` because the Groq
 * call takes several seconds: a bare server-action form gives the browser
 * nothing to show while it waits, and a failure — a missing `GROQ_API_KEY`, a
 * rate limit, unparseable JSON — has to surface as a message on the form
 * instead of a blank retry.
 *
 * The redirect is the success path. It throws a `NEXT_REDIRECT` that unwinds
 * past this function, so nothing after the `create` call ever runs; returning
 * afterwards is not a mistake to guard against.
 */
export async function createMinutesAction(
  _previous: CreateMinutesState,
  formData: FormData,
): Promise<CreateMinutesState> {
  const user = await requireUser();

  const title = field(formData, "title");
  const attendees = field(formData, "attendees");
  const rawNotes = field(formData, "rawNotes");

  if (!title) {
    return { error: "A meeting title is required." };
  }
  if (title.length > MAX_TITLE_CHARS) {
    return {
      error: `Keep the title under ${MAX_TITLE_CHARS} characters.`,
    };
  }
  if (!rawNotes) {
    return { error: "Paste some notes — there is nothing to summarize yet." };
  }
  if (rawNotes.length > MAX_NOTES_CHARS) {
    return {
      error: `Those notes are too long. Trim them to under ${MAX_NOTES_CHARS.toLocaleString("en-US")} characters.`,
    };
  }
  if (attendees.length > MAX_ATTENDEE_CHARS) {
    return {
      error: `That attendee list is too long. Keep it under ${MAX_ATTENDEE_CHARS.toLocaleString("en-US")} characters.`,
    };
  }

  // A missing or rejected GROQ_API_KEY must not leave a half-written row
  // behind: the page would render an empty summary and three empty sections
  // with no way to tell the user that the model never answered.
  let result;
  try {
    result = await generateMinutes(
      rawNotes,
      title,
      attendees || undefined,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[minutes] generation failed for user ${user.id}: ${errorMessage}`,
    );
    return {
      error:
        "Could not generate minutes right now. Your notes were not saved — try again in a moment.",
    };
  }

  let savedId: string;
  try {
    const saved = await prisma.meetingMinutes.create({
      data: {
        userId: user.id,
        title,
        rawNotes,
        // The attendees column is free text and nullable; "no list given" and
        // "an empty list" are the same state here, so absent becomes NULL.
        attendees: attendees || null,
        summaryText: result.summaryText,
        decisions: JSON.stringify(result.decisions),
        actionItems: JSON.stringify(result.actionItems),
        // Nullable because "no next steps" is a real outcome, not a missing
        // one. Storing "[]" instead would make the two indistinguishable.
        nextSteps: result.nextSteps.length > 0
          ? JSON.stringify(result.nextSteps)
          : null,
      },
    });

    savedId = saved.id;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[minutes] save failed for user ${user.id}: ${errorMessage}`);
    return { error: "The minutes were generated but could not be saved." };
  }

  // Outside the try on purpose: `redirect` signals control flow by throwing,
  // so a `try` wrapped around it would catch the success case and report the
  // row as unsaved.
  redirect(`/minutes/${savedId}`);
}
