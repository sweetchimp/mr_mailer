import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { SnoozeButton, type SummarizedEmail } from "../components/email-card";
import type { Route } from "./+types/dashboard.snoozed";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const summaries = await prisma.emailSummary.findMany({
    where: { userId: user.id, status: "SNOOZED" },
    orderBy: { createdAt: "desc" },
  });

  const emails: SummarizedEmail[] = summaries.map((s) => ({
    id: s.gmailMessageId,
    threadId: "",
    messageId: "",
    subject: s.subject,
    sender: s.sender,
    snippet: s.summaryText,
    date: s.createdAt.toISOString(),
    summary: {
      priority: s.priority as "HIGH" | "MEDIUM" | "LOW",
      summaryText: s.summaryText,
      suggestedReply: s.suggestedReply,
      actionRequired: true,
    },
    status: s.status,
    snoozedUntil: s.snoozedUntil?.toISOString() ?? null,
  }));

  return withSessionCookie({ emails } as unknown as Record<string, unknown>, context) as unknown as { emails: SummarizedEmail[] };
}

export default function Snoozed({ loaderData }: Route.ComponentProps) {
  const { emails } = loaderData as { emails: SummarizedEmail[] };
  const snoozeFetcher = useFetcher();

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
        Snoozed
      </h2>
      <p
        className="mb-4 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {emails.length === 0 ? "No snoozed emails." : `${emails.length} email${emails.length === 1 ? "" : "s"} snoozed for later.`}
      </p>

      <div className="space-y-3">
        {emails.map((email) => (
          <div
            key={email.id}
            className="rounded-lg px-4 py-3"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  {email.subject}
                </p>
                <p
                  className="mt-0.5 text-xs"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
                >
                  {email.sender}
                </p>
                {email.snoozedUntil && (
                  <p
                    className="mt-1 text-xs"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
                  >
                    Reminds {new Date(email.snoozedUntil).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SnoozeButton emailId={email.id} snoozeFetcher={snoozeFetcher} />
                <snoozeFetcher.Form
                  method="post"
                  action={`/api/emails/${email.id}/snooze`}
                >
                  <input type="hidden" name="intent" value="cancel" />
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
                    style={{
                      background: "var(--color-line)",
                      color: "var(--color-ink-soft)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    Un-snooze
                  </button>
                </snoozeFetcher.Form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
