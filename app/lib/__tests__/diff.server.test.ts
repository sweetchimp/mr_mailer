import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeReplyDiff } from "../diff.server";

describe("computeReplyDiff", () => {
  it("returns zero diff for identical strings", () => {
    const result = computeReplyDiff("Hello world", "Hello world");
    expect(result).toEqual({ insertions: 0, deletions: 0, modifications: 0 });
  });

  it("counts insertions correctly", () => {
    const result = computeReplyDiff("Hello", "Hello world");
    expect(result.insertions).toBeGreaterThan(0);
    expect(result.deletions).toBe(0);
  });

  it("counts deletions correctly", () => {
    const result = computeReplyDiff("Hello world", "Hello");
    expect(result.deletions).toBeGreaterThan(0);
    expect(result.insertions).toBe(0);
  });

  it("handles empty generated reply", () => {
    const result = computeReplyDiff("", "New content");
    expect(result.insertions).toBe(11);
    expect(result.deletions).toBe(0);
  });

  it("handles empty final reply", () => {
    const result = computeReplyDiff("Original content", "");
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(16);
  });

  it("handles both empty strings", () => {
    const result = computeReplyDiff("", "");
    expect(result).toEqual({ insertions: 0, deletions: 0, modifications: 0 });
  });

  it("handles complete replacement", () => {
    const result = computeReplyDiff("abc", "xyz");
    expect(result.modifications).toBe(3);
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("handles partial edits", () => {
    const result = computeReplyDiff("Hello world", "Hello there world");
    expect(result.insertions).toBeGreaterThan(0);
  });
});
