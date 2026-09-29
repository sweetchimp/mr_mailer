"use client";

import { useActionState } from "react";
import { createMinutesAction, type CreateMinutesState } from "@/app/minutes/actions";

const INPUT_STYLE = {
  fontFamily: "var(--font-body)",
  color: "var(--color-ink)",
  border: "1px solid var(--color-line)",
  background: "var(--color-card)",
  ["--tw-ring-color" as string]: "var(--color-brand-blue)",
} as const;

const LABEL_STYLE = {
  fontFamily: "var(--font-mono)",
  color: "var(--color-ink-soft)",
} as const;

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium uppercase tracking-[0.15em]"
      style={LABEL_STYLE}
    >
      {children}
    </label>
  );
}

function Hint({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <p
      id={htmlFor}
      className="mt-1 text-[12px]"
      style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
    >
      {children}
    </p>
  );
}

/**
 * The minutes form.
 *
 * `useActionState` rather than a bare `<form action={...}>`: the Groq call
 * takes several seconds, so the submit button has to report progress, and a
 * failed generation has to come back as a message on the form instead of a
 * silent no-op. `isPending` covers both — the request is in flight either way.
 *
 * The form is uncontrolled apart from the action state. Nothing here needs to
 * read a field back, and a controlled `notes` field would re-render the whole
 * form on every keystroke for no benefit.
 */
export function MinutesForm() {
  const [state, formAction, isPending] = useActionState<CreateMinutesState, FormData>(
    createMinutesAction,
    {},
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {state.error && (
        <div
          role="alert"
          className="rounded-r-md border-l-[3px] p-4"
          style={{
            background: "var(--color-priority-high-bg)",
            borderLeftColor: "var(--color-priority-high-line)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--color-priority-high-text)" }}
          >
            {state.error}
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="title">Meeting title</Label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Q1 planning"
          aria-describedby="title-hint"
          className="mt-2 w-full rounded-md p-2.5 text-sm focus:outline-none focus:ring-2"
          style={INPUT_STYLE}
        />
        <Hint htmlFor="title-hint">Required. Used to give the model context.</Hint>
      </div>

      <div>
        <Label htmlFor="attendees">Attendees</Label>
        <textarea
          id="attendees"
          name="attendees"
          rows={3}
          maxLength={2000}
          placeholder={"Priya Raman\nAda Lovelace"}
          aria-describedby="attendees-hint"
          className="mt-2 w-full resize-none rounded-md p-2.5 text-sm focus:outline-none focus:ring-2"
          style={INPUT_STYLE}
        />
        <Hint htmlFor="attendees-hint">
          Optional. One per line or comma-separated. Saved as written.
        </Hint>
      </div>

      <div>
        <Label htmlFor="rawNotes">Raw notes</Label>
        <textarea
          id="rawNotes"
          name="rawNotes"
          rows={12}
          required
          maxLength={20000}
          placeholder="ok so priya said the budget is fine but we need to cut the dark mode work, ada will book the room, kickoff march 4..."
          aria-describedby="rawNotes-hint"
          className="mt-2 w-full resize-y rounded-md p-3 text-sm focus:outline-none focus:ring-2"
          style={INPUT_STYLE}
        />
        <Hint htmlFor="rawNotes-hint">
          Required. Messy is fine — it is what gets structured.
        </Hint>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {isPending ? "Generating minutes…" : "Generate minutes"}
        </button>
        {isPending && (
          <span
            className="text-[12px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            This takes a few seconds.
          </span>
        )}
      </div>
    </form>
  );
}
