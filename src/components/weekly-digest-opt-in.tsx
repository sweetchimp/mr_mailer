"use client";

import { useState, useTransition } from "react";
import { setWeeklyDigestEmailAction } from "@/app/weekly-summary/actions";

/**
 * The Sunday-evening email opt-in.
 *
 * Off by default and rendered as an explicit choice rather than a link to a
 * settings page that does not exist. The confirmation is local state rather than
 * the server's `checked` prop so the box responds on tap instead of after a
 * round trip; a save failure re-renders from the server and puts it back.
 */
export function WeeklyDigestOptIn({
  initialEnabled,
  recipient,
}: {
  initialEnabled: boolean;
  recipient: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);

    startTransition(async () => {
      const result = await setWeeklyDigestEmailAction(next);
      if (!result.ok) {
        setEnabled(!next);
        setError(result.error ?? "Could not save that change.");
      }
    });
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isPending}
          onChange={toggle}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
          style={{ accentColor: "var(--color-brand-blue)" }}
        />
        <span className="min-w-0">
          <span
            className="block text-sm font-medium"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
          >
            Email me this summary every Sunday evening
          </span>
          <span
            className="mt-1 block text-[12px]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            Sent to {recipient}
          </span>
        </span>
      </label>

      {error && (
        <p
          className="mt-2 text-[12px]"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-priority-high-text)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
