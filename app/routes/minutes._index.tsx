import { Link } from "react-router";
import { authMiddleware } from "../middleware/auth.server";
import { withSessionCookie } from "../lib/session.server";
import { prisma } from "../lib/prisma.server";
import { userContext } from "../context";
import type { Route } from "./+types/minutes._index";

export const middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const minutes = await prisma.meetingMinutes.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true },
  });

  const data = minutes.map((m) => ({
    id: m.id,
    title: m.title,
    createdAt: m.createdAt.toISOString(),
  }));

  return withSessionCookie({ minutes: data } as unknown as Record<string, unknown>, context) as unknown as { minutes: typeof data };
}

export default function MinutesIndex({ loaderData }: Route.ComponentProps) {
  const { minutes } = loaderData as {
    minutes: { id: string; title: string; createdAt: string }[];
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2
            className="text-[11px] uppercase tracking-[0.15em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
          >
            Meeting minutes
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
          >
            {minutes.length === 0
              ? "No minutes yet."
              : `${minutes.length} saved ${minutes.length === 1 ? "meeting" : "meetings"}.`}
          </p>
        </div>
        <Link
          to="/minutes/new"
          className="btn btn-primary shrink-0 px-4 py-2 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          + New minutes
        </Link>
      </div>

      {minutes.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: "1px solid var(--color-line)" }}>
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            Nothing here yet. Create your first set of minutes.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {minutes.map((m) => (
            <li key={m.id}>
              <Link
                to={`/minutes/${m.id}`}
                className="flex items-center justify-between gap-4 rounded-xl p-4 transition-all hover:scale-[1.01]"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-line)",
                }}
              >
                <span
                  className="truncate text-sm font-medium"
                  style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                >
                  {m.title}
                </span>
                <span
                  className="shrink-0 text-[12px]"
                  style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
                >
                  {new Date(m.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
