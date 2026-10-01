/**
 * Placeholder shaped like `StatTile` and `DiveTile`, for the route-level
 * `loading` boundary.
 *
 * It matches the real tile's box so the grid does not reflow when the data
 * arrives. No animation: a pulsing skeleton implies work is ongoing, and on a
 * page that resolves in a few hundred milliseconds it is mostly a flash of
 * something moving for no reason.
 */
export function StatTileSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-line)",
        minHeight: tall ? 96 : 72,
      }}
    >
      <div
        className="h-[13px] w-20"
        style={{ background: "var(--color-line)", borderRadius: 3 }}
      />
      <div
        className="mt-3 h-6 w-10"
        style={{ background: "var(--color-line)", borderRadius: 3 }}
      />
    </div>
  );
}
