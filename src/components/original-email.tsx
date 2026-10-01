"use client";

import { useState, useTransition } from "react";
import { getEmailBodyAction } from "@/app/dashboard/actions";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; body: string | null }
  | { status: "error"; message: string };

/**
 * The original message, on demand.
 *
 * Fetched only when asked for, because a dashboard can show dozens of cards and
 * a provider call per card is exactly the pattern that makes the page feel
 * broken. The server action short-circuits on the copy stored at ingest time and
 * only reaches the provider for older emails that predate it.
 *
 * Once loaded the body is held here, so collapsing and reopening is free and the
 * reader can compare what they are replying against without a second round trip.
 */
export function OriginalEmail({
  emailId,
  snippet,
}: {
  emailId: string;
  snippet: string | null;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  const open = () => {
    setState((current) => {
      if (current.status === "idle" || current.status === "error") {
        return { status: "loading" };
      }
      return current;
    });

    startTransition(async () => {
      const result = await getEmailBodyAction(emailId);

      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      setState({ status: "loaded", body: result.body });
    });
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        aria-expanded={state.status === "loaded"}
        className="text-xs font-medium disabled:opacity-60"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-brand-blue)" }}
      >
        {state.status === "loading" ? "Loading original…" : "Show original email"}
      </button>

      {state.status === "error" && (
        <p
          className="mt-2 text-xs"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          role="status"
        >
          Couldn&apos;t load the original — {state.message}
        </p>
      )}

      {state.status === "loaded" &&
        (state.body ? (
          <pre
            className="mt-2 max-h-64 overflow-auto rounded-md p-3 text-[13px]"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-ink-soft)",
              background: "var(--color-bg)",
              border: "1px solid var(--color-line)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {state.body}
          </pre>
        ) : (
          // No body and no snippet means the message really is body-less — a
          // calendar invite, a file-only mail. Saying so plainly beats an
          // empty box that looks like a failed load.
          snippet ? (
            <p
              className="mt-2 text-[13px]"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
            >
              {snippet}
            </p>
          ) : (
            <p
              className="mt-2 text-xs"
              style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
            >
              This message has no text body.
            </p>
          )
        ))}
    </div>
  );
}
