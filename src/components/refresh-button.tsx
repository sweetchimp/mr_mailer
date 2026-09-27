"use client";

import { useState, useTransition } from "react";
import { refreshDigestAction } from "@/app/dashboard/actions";

/**
 * Enqueues a digest run. The worker takes a moment to pick it up, so on
 * success we wait briefly and then refresh to pick up the new summaries —
 * the original did the same thing with a 15s reload.
 */
export function RefreshButton({ light = false }: { light?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const result = await refreshDigestAction();
      if (!result.ok) {
        setError(result.error ?? "Could not queue a refresh");
        return;
      }
      setQueued(true);
      setTimeout(() => window.location.reload(), 15_000);
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={isPending || queued}
        className="btn cursor-pointer border-none bg-transparent p-0 text-[12px] underline decoration-current underline-offset-2 hover:opacity-70 disabled:opacity-40"
        style={{
          fontFamily: "var(--font-mono)",
          color: light ? "rgba(255,255,255,0.5)" : "var(--color-ink-soft)",
        }}
      >
        {isPending ? "Refreshing…" : queued ? "Digesting…" : "Refresh now"}
      </button>
      {error && (
        <span
          className="text-[12px]"
          style={{ fontFamily: "var(--font-mono)", color: "var(--color-priority-high-text)" }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
