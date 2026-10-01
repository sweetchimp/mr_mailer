import { StatTileSkeleton } from "@/components/stat-tile-skeleton";

/**
 * Shown while the dashboard's own queries are in flight.
 *
 * The page cannot stream: it awaits counts, provider, failure state, handled
 * totals and the meetings cache before it has anything to return. Without this
 * file the browser sits on a blank screen for the whole of it, which reads as
 * "the app is broken" rather than "the app is working". With it, the chrome is
 * already painted by the layout and only the numbers are missing.
 *
 * The placeholders mirror the real tile grid rather than showing a spinner, so
 * nothing jumps when the data lands.
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div aria-hidden="true" className="grid grid-cols-3 gap-3">
        <StatTileSkeleton />
        <StatTileSkeleton />
        <StatTileSkeleton />
      </div>

      <div className="mt-8">
        <div
          className="h-5 w-40"
          style={{ background: "var(--color-line)", borderRadius: 4 }}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTileSkeleton tall />
          <StatTileSkeleton tall />
          <StatTileSkeleton tall />
        </div>
      </div>

      <div className="mt-6">
        <div
          className="h-4 w-32"
          style={{ background: "var(--color-line)", borderRadius: 4 }}
        />
        <div
          className="mt-3 h-16 w-full"
          style={{ background: "var(--color-line)", borderRadius: 12 }}
        />
      </div>

      <p className="sr-only" role="status">
        Loading your dashboard
      </p>
    </main>
  );
}
