"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EmailCard } from "./email-card";
import { dismissAction, snoozeAction } from "@/app/dashboard/actions";
import type { HistoryEmail, SummarizedEmail } from "@/lib/email-view";

export function EmailList({
  emails,
  selectable = false,
  unsubscribeNotices = {},
}: {
  emails: SummarizedEmail[];
  /** Enables checkboxes and the bulk-dismiss bar. */
  selectable?: boolean;
  /** Keyed by normalized sender address; see `getUnsubscribeNotices`. */
  unsubscribeNotices?: Record<string, { senderName: string | null; count: number }>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Hooks must run before this return; the early exit used to sit above them.
  if (emails.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  const clear = () => setSelected([]);

  /**
   * The existing per-email `dismissAction`, called once per selected row inside
   * a single transition.
   *
   * Not a new bulk action on purpose: `dismissAction` is the one place the
   * ownership check lives, and every call re-verifies that the row belongs to
   * the caller before touching it. A batched variant would be a second code path
   * around that check. Each call revalidates `/dashboard/layout`, but React
   * coalesces them into one render pass, and the list is capped at 200 rows.
   */
  const dismissSelected = () => {
    const ids = selected;
    clear();

    startTransition(async () => {
      await Promise.all(ids.map((id) => dismissAction(id)));
    });
  };

  return (
    <>
      {selectable && selected.length > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
        >
          <span
            className="text-sm font-medium"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
          >
            {selected.length} selected
          </span>
          <button
            type="button"
            onClick={dismissSelected}
            disabled={isPending}
            className="btn btn-primary px-4 py-1.5 text-sm disabled:opacity-50"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {isPending ? "Dismissing…" : "Dismiss selected"}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            className="btn btn-link text-xs"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Clear
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {emails.map((email) => (
          <li key={email.id}>
            <EmailCard
              email={email}
              selectable={selectable}
              selected={selected.includes(email.id)}
              onToggleSelect={toggle}
              unsubscribeNotice={
                email.senderAddress
                  ? (unsubscribeNotices[email.senderAddress] ?? null)
                  : null
              }
            />
          </li>
        ))}
      </ul>
    </>
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
  query = "",
}: {
  emails: HistoryEmail[];
  /** Only the history bucket is searchable; replied stays a plain archive. */
  searchable?: boolean;
  /** Echoed back into the input so the box shows what is actually filtered. */
  query?: string;
}) {
  return (
    <>
      {searchable && (
        // A plain GET form, not client state: filtering happens in SQL, so the
        // result is a URL that survives reload, sharing, and the back button.
        // Shown even when empty, or there is no way to start a search once the
        // current query matches nothing.
        <form
          action="/dashboard/history"
          method="get"
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search subject, sender, or summary"
            aria-label="Search history"
            className="min-w-0 flex-1 rounded-md p-2.5 text-sm focus:outline-none focus:ring-2"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-ink)",
              border: "1px solid var(--color-line)",
              background: "var(--color-card)",
              ["--tw-ring-color" as string]: "var(--color-brand-blue)",
            }}
          />
          <button type="submit" className="btn btn-primary px-4 py-2 text-sm">
            Search
          </button>
          {query && (
            <Link href="/dashboard/history" className="btn btn-link text-xs">
              Clear
            </Link>
          )}
        </form>
      )}

      {emails.length === 0 ? (
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
        >
          {query
            ? `No history matches “${query}”.`
            : "No matches found."}
        </p>
      ) : (
        <ul className="space-y-3">
          {emails.map((email) => (
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
                  className="mt-1 truncate text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
                >
                  {email.sender}
                </p>
                {email.summary && (
                  <p
                    className="mt-1.5 line-clamp-2 text-sm"
                    style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
                  >
                    {email.summary}
                  </p>
                )}
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
