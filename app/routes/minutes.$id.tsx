import { useState } from "react";
import { Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import type { Route } from "./+types/minutes.$id";

export const middleware = [authMiddleware];

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    // fall back to line splitting
  }
  return raw
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const minutes = await prisma.meetingMinutes.findFirst({
    where: { id: params.id, userId: user.id },
  });

  if (!minutes) {
    throw new Response("Minutes not found", { status: 404 });
  }

  const data = {
    id: minutes.id,
    title: minutes.title,
    attendees: minutes.attendees,
    summaryText: minutes.summaryText,
    decisions: parseList(minutes.decisions),
    actionItems: parseList(minutes.actionItems),
    nextSteps: parseList(minutes.nextSteps),
    createdAt: minutes.createdAt.toISOString(),
  };

  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3
        className="mb-2 text-[11px] uppercase tracking-[0.15em]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function MinutesDetail({ loaderData }: Route.ComponentProps) {
  const minutes = loaderData as typeof loaderData;
  const [copied, setCopied] = useState(false);

  const formattedDate = new Date(minutes.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const asText = [
    minutes.title,
    formattedDate,
    minutes.attendees ? `Attendees: ${minutes.attendees}` : "",
    "",
    "Summary",
    minutes.summaryText,
    "",
    "Decisions",
    ...(minutes.decisions.length > 0 ? minutes.decisions.map((d) => `- ${d}`) : ["- None"]),
    "",
    "Action items",
    ...(minutes.actionItems.length > 0
      ? minutes.actionItems.map((a) => `- ${a}`)
      : ["- None"]),
    ...(minutes.nextSteps.length > 0
      ? ["", "Next steps", ...minutes.nextSteps.map((n) => `- ${n}`)]
      : []),
  ].join("\n");

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/minutes"
          className="btn btn-link text-[13px]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          &larr; All minutes
        </Link>
        <button
          type="button"
          onClick={copyToClipboard}
          className="btn btn-soft px-3 py-1.5 text-[12px]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {copied ? "Copied!" : "Copy as text"}
        </button>
      </div>

      <h1
        className="text-[26px] leading-tight"
        style={{ fontFamily: "var(--font-display)", fontWeight: 500, color: "var(--color-ink)" }}
      >
        {minutes.title}
      </h1>
      <p
        className="mt-1 text-[13px]"
        style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
      >
        {formattedDate}
        {minutes.attendees ? ` · ${minutes.attendees}` : ""}
      </p>

      <div className="mt-6 space-y-6">
        <Section title="Summary">
          <p
            className="text-sm leading-relaxed"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
          >
            {minutes.summaryText}
          </p>
        </Section>

        <Section title="Decisions">
          {minutes.decisions.length === 0 ? (
            <p className="text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}>
              No decisions recorded.
            </p>
          ) : (
            <ul className="space-y-2">
              {minutes.decisions.map((decision, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  <span style={{ color: "var(--color-ink-faint)" }}>{"\u25CF"}</span>
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Action items">
          {minutes.actionItems.length === 0 ? (
            <p className="text-sm" style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}>
              No action items recorded.
            </p>
          ) : (
            <ul className="space-y-2">
              {minutes.actionItems.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  <span style={{ color: "var(--color-ink-faint)" }}>{"\u25A1"}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {minutes.nextSteps.length > 0 && (
          <Section title="Next steps">
            <ul className="space-y-2">
              {minutes.nextSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 text-sm"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  <span style={{ color: "var(--color-ink-faint)" }}>{"\u203A"}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </main>
  );
}
