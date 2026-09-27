"use client";

import { useMemo, useState } from "react";
import { EmailCard } from "./email-card";
import { snoozeAction } from "@/app/dashboard/actions";
import { useTransition } from "react";
import type { HistoryEmail, SummarizedEmail } from "@/lib/email-view";

export function EmailList({ emails }: { emails: SummarizedEmail[] }) {
  if (emails.length === 0) return null;

  return (
    <ul className="space-y-3">
      {emails.map((email) => (
        <li key={email.id}>
          <EmailCard email={email} />
        </li>
      ))}
    </ul>
  );
}

export function SnoozedList({ emails }: { emails: SummarizedEmail[] }) {
  if (emails.length === 0) return null;

  return (
    <ul className="space-y-3">
      {emails.map((email) => (
        <li key={email.id}>
          <SnoozedRow email={email} />
        </li>
      ))}
    </ul>
  );
}

function SnoozedRow({ email }: { email: SummarizedEmail }) {
  const [isPending, startTransition] = useTransition();

  const unsnooze = () => {
    startTransition(async () => {
      await snoozeAction(email.id, null);
    });
  };

  const remindsLabel = email.snoozedUntil
    ? `Reminds ${new Date(email.snoozedUntil).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`
    : null;

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
      }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[15px]"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
        >
          {email.subject}
        </p>
        <p
          className="mt-1 text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          {email.sender}
        </p>
      </div>

      {remindsLabel && (
        <span
          suppressHydrationWarning
          className="shrink-0 text-[11px] whitespace-nowrap"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
        >
          {remindsLabel}
        </span>
      )}

      <button
        type="button"
        onClick={unsnooze}
        disabled={isPending}
        className="btn btn-soft shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
        style={{ fontFamily: "var(--font-body)" }}
      >
        Un-snooze
      </button>
    </div>
  );
}

export function HistoryList({
  emails,
  searchable = false,
}: {
  emails: HistoryEmail[];
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return emails;
    const query = search.trim().toLowerCase();
    return emails.filter(
      (email) =>
        email.subject.toLowerCase().includes(query) ||
        email.sender.toLowerCase().includes(query),
    );
  }, [emails, search, searchable]);

  return (
    <>
      {searchable && emails.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subject or sender"
          className="mb-4 w-full rounded-md p-2.5 text-sm focus:outline-none focus:ring-2"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-ink)",
            border: "1px solid var(--color-line)",
            background: "var(--color-card)",
            ["--tw-ring-color" as string]: "var(--color-brand-blue)",
          }}
        />
      )}

      {filtered.length === 0 ? (
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          No matches found.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((email) => (
            <li
              key={email.id}
              className="flex flex-wrap items-center gap-4 rounded-xl p-4"
              style={{
                background: "var(--color-card)",
                border: "1px solid var(--color-line)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[15px]"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  {email.subject}
                </p>
                <p
                  className="mt-1 text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
                >
                  {email.sender}
                </p>
              </div>

              <span
                className="shrink-0 rounded-full px-2 py-px text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  background: "var(--color-priority-low-bg)",
                  color: "var(--color-priority-low-text)",
                }}
              >
                {email.status === "SENT" ? "Replied" : "Dismissed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
