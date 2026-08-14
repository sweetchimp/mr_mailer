import { Form, redirect } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { generateMinutes } from "../services/minutes.server";
import type { Route } from "./+types/minutes.new";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  return withSessionCookie({}, context);
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();
  const attendees = String(formData.get("attendees") ?? "").trim() || null;
  const rawNotes = String(formData.get("rawNotes") ?? "").trim();

  if (!title || !rawNotes) {
    return withSessionCookie(
      { error: "A title and your notes are required." },
      context,
    );
  }

  try {
    const result = await generateMinutes(rawNotes, title, attendees ?? undefined);

    const saved = await prisma.meetingMinutes.create({
      data: {
        userId: user.id,
        title,
        rawNotes,
        attendees,
        summaryText: result.summaryText,
        decisions: JSON.stringify(result.decisions),
        actionItems: JSON.stringify(result.actionItems),
        nextSteps: JSON.stringify(result.nextSteps),
      },
    });

    throw redirect(`/minutes/${saved.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return withSessionCookie(
      { error: "Failed to generate minutes. Please try again." },
      context,
    );
  }
}

export default function MinutesNew({ actionData }: Route.ComponentProps) {
  const error = (actionData as { error?: string } | undefined)?.error;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h2
        className="mb-1 text-[11px] uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        Meeting minutes
      </h2>
      <p
        className="mb-6 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        Paste your rough notes and get structured minutes.
      </p>

      {error && (
        <p
          className="mb-4 rounded-md border-l-[3px] p-3 text-sm"
          style={{
            background: "var(--color-priority-high-bg)",
            borderLeftColor: "var(--color-priority-high-line)",
            color: "var(--color-priority-high-text)",
            fontFamily: "var(--font-body)",
          }}
        >
          {error}
        </p>
      )}

      <Form
        method="post"
        className="space-y-4 rounded-xl p-5"
        style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
      >
        <div>
          <label
            htmlFor="title"
            className="mb-1 block text-[12px] font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
          >
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Q3 planning sync"
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="attendees"
            className="mb-1 block text-[12px] font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
          >
            Attendees{" "}
            <span style={{ color: "var(--color-ink-faint)" }}>(optional, comma-separated)</span>
          </label>
          <input
            id="attendees"
            name="attendees"
            type="text"
            placeholder="e.g. Priya, Sam, Dana"
            className="w-full rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-body)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="rawNotes"
            className="mb-1 block text-[12px] font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
          >
            Notes
          </label>
          <textarea
            id="rawNotes"
            name="rawNotes"
            required
            rows={12}
            placeholder="Paste your rough, unformatted notes here…"
            className="w-full resize-y rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full px-6 py-3 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Generate minutes
        </button>
      </Form>
    </main>
  );
}
