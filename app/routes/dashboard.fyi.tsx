import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import { EmailCard, type SummarizedEmail } from "../components/email-card";
import type { Route } from "./+types/dashboard.fyi";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const summaries = await prisma.emailSummary.findMany({
    where: { userId: user.id, status: "PENDING", priority: "LOW" },
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
      actionRequired: false,
    },
    status: s.status,
    snoozedUntil: null,
  }));

  return withSessionCookie({ emails } as unknown as Record<string, unknown>, context) as unknown as { emails: SummarizedEmail[] };
}

export default function FYI({ loaderData }: Route.ComponentProps) {
  const { emails } = loaderData as { emails: SummarizedEmail[] };
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const sendFetcher = useFetcher();
  const dismissFetcher = useFetcher();
  const snoozeFetcher = useFetcher();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/dashboard"
        className="btn btn-link mb-4 text-[13px]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        &larr; Back to overview
      </Link>

      <h2
        className="mb-1 text-[11px] uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        FYI
      </h2>
      <p
        className="mb-4 text-sm"
        style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
      >
        {emails.length === 0 ? "No low-priority emails to review." : `${emails.length} FYI email${emails.length === 1 ? "" : "s"}.`}
      </p>

      <div className="space-y-3">
        {emails.map((email) => (
          <EmailCard
            key={email.id}
            email={email}
            isExpanded={expandedCard === email.id}
            onToggle={() => setExpandedCard(expandedCard === email.id ? null : email.id)}
            sendFetcher={sendFetcher}
            dismissFetcher={dismissFetcher}
            snoozeFetcher={snoozeFetcher}
            replyText={replyTexts[email.id] ?? ""}
            onReplyChange={(text) => setReplyTexts((prev) => ({ ...prev, [email.id]: text }))}
          />
        ))}
      </div>
    </main>
  );
}
