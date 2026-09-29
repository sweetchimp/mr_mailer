import Link from "next/link";
import { requireUser } from "@/lib/current-session.server";
import { getMinutesForUser } from "@/services/minutes.server";
import { splitAttendees } from "@/lib/minutes-view";

/** Long enough to read in a glance, and in the display face like a title. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function MinutesPage() {
  const user = await requireUser();
  const minutes = await getMinutesForUser(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-[13px] font-medium uppercase tracking-[0.15em]"
            style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
          >
            Meeting Minutes
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-soft)" }}
          >
            {minutes.length === 0
              ? "No minutes yet."
              : `${minutes.length} set${minutes.length === 1 ? "" : "s"} of minutes, most recent first.`}
          </p>
        </div>

        <Link
          href="/minutes/new"
          className="btn btn-primary px-4 py-2 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          New minutes
        </Link>
      </div>

      {minutes.length === 0 ? (
        <div
          className="mt-6 rounded-xl p-6 text-center"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-line)" }}
        >
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-body)", color: "var(--color-ink-faint)" }}
          >
            Nothing here yet. Paste your rough notes and get structured minutes.
          </p>
          <Link
            href="/minutes/new"
            className="btn btn-outline mt-4 px-4 py-2 text-sm"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Write the first one &rarr;
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {minutes.map((entry) => {
            const attendeeCount = splitAttendees(entry.attendees).length;
            return (
              <li key={entry.id}>
                <Link
                  href={`/minutes/${entry.id}`}
                  className="group block rounded-xl p-4 transition-colors hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-line)",
                    outlineColor: "var(--color-brand-blue)",
                  }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span
                      className="truncate text-sm font-medium"
                      style={{ fontFamily: "var(--font-body)", color: "var(--color-ink)" }}
                    >
                      {entry.title}
                    </span>
                    <span
                      className="shrink-0 text-[12px]"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-soft)" }}
                    >
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  {attendeeCount > 0 && (
                    <p
                      className="mt-1 text-[12px]"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--color-ink-faint)" }}
                    >
                      {attendeeCount} attendee{attendeeCount === 1 ? "" : "s"}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
