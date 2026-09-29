import { describe, it, expect } from "vitest";

import { pluralizeEdits, summarizeEdits } from "../reply-insights";

describe("summarizeEdits", () => {
  it("returns zeroes for an empty list rather than dividing by zero", () => {
    expect(summarizeEdits([])).toEqual({
      editCount: 0,
      avgInsertions: 0,
      avgDeletions: 0,
      avgModifications: 0,
    });
  });

  it("averages per-edit size, not the total", () => {
    const summary = summarizeEdits([
      { insertions: 10, deletions: 4, modifications: 2 },
      { insertions: 20, deletions: 6, modifications: 3 },
    ]);

    expect(summary).toEqual({
      editCount: 2,
      avgInsertions: 15,
      avgDeletions: 5,
      avgModifications: 3,
    });
  });

  it("rounds to whole characters", () => {
    const summary = summarizeEdits([
      { insertions: 1, deletions: 1, modifications: 0 },
      { insertions: 2, deletions: 1, modifications: 0 },
      { insertions: 2, deletions: 1, modifications: 0 },
    ]);

    expect(summary.avgInsertions).toBe(2);
    expect(Number.isInteger(summary.avgDeletions)).toBe(true);
  });

  it("treats an untouched edit as zero across the board", () => {
    expect(
      summarizeEdits([{ insertions: 0, deletions: 0, modifications: 0 }]),
    ).toMatchObject({ editCount: 1, avgInsertions: 0, avgDeletions: 0 });
  });
});

describe("pluralizeEdits", () => {
  it("agrees with the count", () => {
    expect(pluralizeEdits(0)).toBe("0 edited replies");
    expect(pluralizeEdits(1)).toBe("1 edited reply");
    expect(pluralizeEdits(7)).toBe("7 edited replies");
  });
});
