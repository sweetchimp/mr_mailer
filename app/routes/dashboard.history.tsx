import { useState, useMemo } from "react";
import { Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import type { Route } from "./+types/dashboard.history";

export const middleware = [authMiddleware];

interface HistoryEmail {
  id: string;
  subject: string;
  sender: string;
  status: string;
  date: string;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const summaries = await prisma.emailSummary.findMany({
    where: { userId: user.id, status: { in: ["SENT", "DISMISSED"] } },
    orderBy: { createdAt: "desc" },
  });

  const emails: HistoryEmail[] = summaries.map((s) => ({
    id: s.gmailMessageId,
    subject: s.subject,
    sender: s.sender,
    status: s.status,
    date: s.createdAt.toISOString(),
  }));

  return withSessionCookie({ emails } as unknown as Record<string, unknown>, context) as unknown as { emails: HistoryEmail[] };
}

export default function History({ loaderData }: Route.ComponentProps) {
  const { emails } = loaderData as { emails: HistoryEmail[] };
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter(
      (e) => e.subject.toLowerCase().includes(q) || e.sender.toLowerCase().includes(q),
    );
  }, [emails, search]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/dashboard"
        className="mb-4 inline-block text-[13px] hover:opacity-70"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        &larr; Back to overview
      </Link>

      <h2
        className="mb-1 text-[11px] uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        History
      </h2>
      <p
        className="mb-4 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {emails.length === 0 ? "No history yet." : `${emails.length} email${emails.length === 1 ? "" : "s"} in your archive.`}
      </p>

      {emails.length > 0 && (
        <>
          <input
            type="text"
            placeholder="Search subject or sender..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-ink)",
              background: "var(--color-card)",
              border: "1px solid var(--color-line)",
              ["--tw-ring-color" as string]: "var(--color-brand-blue)",
            }}
          />

          <div className="space-y-2">
            {filtered.map((email) => (
              <div
                key={email.id}
                className="flex items-center justify-between rounded-lg px-4 py-2.5"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className="truncate text-sm"
                      style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                    >
                      {email.subject}
                    </p>
                    <span
                      className="inline-block shrink-0 rounded-full px-2 py-px text-[10px] uppercase"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        background: email.status === "SENT" ? "var(--color-priority-low-bg)" : "var(--color-line)",
                        color: email.status === "SENT" ? "var(--color-priority-low-text)" : "var(--color-ink-faint)",
                      }}
                    >
                      {email.status === "SENT" ? "Replied" : "Dismissed"}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
                  >
                    {email.sender}
                  </p>
                </div>
                <span
                  className="shrink-0 text-[11px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
                >
                  {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <p
                className="py-2 text-sm"
                style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
              >
                No matches found.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
