import { describe, it, expect } from "vitest";

import { MAX_SEARCH_CHARS, normalizeSearch } from "../email-view";

describe("normalizeSearch", () => {
  it("trims a real query", () => {
    expect(normalizeSearch("  budget  ")).toBe("budget");
  });

  it("returns null for missing input, so the caller can skip the filter", () => {
    expect(normalizeSearch(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizeSearch("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(normalizeSearch("  \t\n ")).toBeNull();
  });

  it("collapses runs of internal whitespace", () => {
    // A URL-encoded "budget   review" should behave as the phrase that was
    // typed, not as a single run-on substring that matches nothing.
    expect(normalizeSearch("budget   review")).toBe("budget review");
    expect(normalizeSearch("  budget\treview\n")).toBe("budget review");
  });

  it("takes the first value when the param is repeated", () => {
    expect(normalizeSearch(["budget", "review"])).toBe("budget");
  });

  it("uses the first value even when it is blank", () => {
    expect(normalizeSearch(["", "review"])).toBeNull();
  });

  it("truncates an absurdly long query", () => {
    // Bounds the LIKE escape, and keeps the query in a URL.
    expect(normalizeSearch("a".repeat(500))).toBe("a".repeat(MAX_SEARCH_CHARS));
  });

  it("truncates after trimming and collapsing", () => {
    // Collapse happens first, so the run collapses to a single space before the
    // length cap is applied.
    expect(normalizeSearch(`  budget  ${"a".repeat(500)}`)).toBe(
      `budget ${"a".repeat(MAX_SEARCH_CHARS - 7)}`,
    );
  });

  it("does not lowercase, so the collation handles case", () => {
    expect(normalizeSearch("Budget")).toBe("Budget");
  });
});
