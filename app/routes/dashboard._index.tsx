import { Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import type { Route } from "./+types/dashboard._index";
import type { DashboardCounts } from "./dashboard";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const [high, medium, low, replied, snoozed, history] = await Promise.all([
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "HIGH" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "MEDIUM" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "PENDING", priority: "LOW" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SENT" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: "SNOOZED" } }),
    prisma.emailSummary.count({ where: { userId: user.id, status: { in: ["SENT", "DISMISSED"] } } }),
  ]);

  const data = { counts: { high, medium, low, replied, snoozed, history } satisfies DashboardCounts };
  return withSessionCookie(data as unknown as Record<string, unknown>, context) as unknown as typeof data;
}

export default function DashboardIndex({ loaderData }: Route.ComponentProps) {
  const { counts } = loaderData as { counts: DashboardCounts };

  const tiles = [
    {
      label: "Needs a reply",
      count: counts.high,
      to: "/dashboard/needs-reply",
      bg: "var(--color-priority-high-bg)",
      text: "var(--color-priority-high-text)",
      line: "var(--color-priority-high-line)",
    },
    {
      label: "Worth a glance",
      count: counts.medium,
      to: "/dashboard/worth-a-glance",
      bg: "var(--color-priority-medium-bg)",
      text: "var(--color-priority-medium-text)",
      line: "var(--color-priority-medium-line)",
    },
    {
      label: "FYI",
      count: counts.low,
      to: "/dashboard/fyi",
      bg: "var(--color-priority-low-bg)",
      text: "var(--color-priority-low-text)",
      line: "var(--color-priority-low-line)",
    },
    {
      label: "Replied",
      count: counts.replied,
      to: "/dashboard/replied",
      bg: "var(--color-card)",
      text: "var(--color-ink)",
      line: "var(--color-line)",
    },
    {
      label: "Snoozed",
      count: counts.snoozed,
      to: "/dashboard/snoozed",
      bg: "var(--color-card)",
      text: "var(--color-ink)",
      line: "var(--color-line)",
    },
    {
      label: "History",
      count: counts.history,
      to: "/dashboard/history",
      bg: "var(--color-card)",
      text: "var(--color-ink)",
      line: "var(--color-line)",
    },
  ];

  const total = counts.high + counts.medium + counts.low + counts.replied + counts.snoozed;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {total === 0 ? (
        <div className="text-center">
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            All clear for today. No emails need your attention.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="group block rounded-xl p-5 transition-all hover:scale-[1.02]"
              style={{
                background: tile.bg,
                border: `1px solid ${tile.line}`,
              }}
            >
              <p
                className="text-[13px] font-medium"
                style={{ fontFamily: "var(--font-body)", color: tile.text }}
              >
                {tile.label}
              </p>
              <p
                className="mt-2 text-2xl font-semibold"
                style={{ fontFamily: "var(--font-display)", color: tile.text }}
              >
                {tile.count}
              </p>
              <p
                className="mt-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ fontFamily: "var(--font-mono)", color: tile.text }}
              >
                View &rarr;
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
