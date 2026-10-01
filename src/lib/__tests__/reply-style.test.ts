import { describe, it, expect } from "vitest";
import {
  MIN_SAMPLES_FOR_STYLE,
  buildStylePrompt,
  clampStyleNote,
  parseStyleNote,
  selectPromptSamples,
  summarizeStyleSamples,
} from "../reply-style";
import type { StyleAnalysisSample } from "../reply-style";

function sample(overrides: Partial<StyleAnalysisSample> = {}): StyleAnalysisSample {
  return {
    id: "r1",
    suggested: "Sounds good, thanks.",
    sent: "Sounds good, thanks.",
    accepted: true,
    insertions: 0,
    deletions: 0,
    modifications: 0,
    sentAt: new Date("2026-01-01T09:00:00Z"),
    subject: "Re: Timeline",
    priority: "MEDIUM",
    senderAddress: "alice@example.com",
    ...overrides,
  };
}

function many(count: number, accepted: boolean): StyleAnalysisSample[] {
  return Array.from({ length: count }, (_, index) =>
    sample({
      id: `${accepted ? "a" : "r"}-${index}`,
      accepted,
      suggested: "Sounds good, thanks.",
      sent: accepted ? "Sounds good, thanks." : "Yes — that works for me, thanks Alice.",
    }),
  );
}

describe("selectPromptSamples", () => {
  it("keeps accepted replies", () => {
    // The regression this guards: accepted pairs were filtered out as
    // "uninformative", which left the model with only failures and a note built
    // entirely from what the assistant got wrong.
    const accepted = [sample({ id: "a1" })];

    expect(selectPromptSamples(accepted).map((s) => s.id)).toEqual(["a1"]);
  });

  it("keeps both kinds when they are mixed", () => {
    const selected = selectPromptSamples([
      sample({ id: "a1", accepted: true }),
      sample({ id: "r1", accepted: false, sent: "Different." }),
    ]);

    expect(selected.map((s) => s.id).sort()).toEqual(["a1", "r1"]);
  });

  it("caps accepted at half the window so they cannot crowd out rewrites", () => {
    const selected = selectPromptSamples([...many(40, true), ...many(4, false)]);

    const acceptedCount = selected.filter((s) => s.accepted).length;
    const rewriteCount = selected.filter((s) => !s.accepted).length;

    // 15 accepted, not 26. The window is 30, so half is the ceiling on the cheap
    // signal. The four rewrites are all kept — they are the ones worth
    // generalising from, and there is no padding to reach 30 with.
    expect(acceptedCount).toBe(15);
    expect(rewriteCount).toBe(4);
    expect(selected).toHaveLength(19);
  });

  it("fills the window from rewrites when there are few accepted", () => {
    const selected = selectPromptSamples([...many(2, true), ...many(50, false)]);

    expect(selected).toHaveLength(30);
    expect(selected.filter((s) => s.accepted)).toHaveLength(2);
  });

  it("alternates so no run of accepted replies can be read as the user's voice", () => {
    const selected = selectPromptSamples([...many(6, false), ...many(6, true)]);

    const flags = selected.map((s) => s.accepted);
    // No two accepted in a row while both kinds remain.
    for (let index = 1; index < flags.length; index += 1) {
      if (flags[index] && flags[index - 1]) {
        throw new Error(`two accepted replies in a row at ${index}`);
      }
    }
  });

  it("returns nothing for an empty history", () => {
    expect(selectPromptSamples([])).toEqual([]);
  });
});

describe("buildStylePrompt", () => {
  it("labels which replies were sent unchanged", () => {
    const prompt = buildStylePrompt([
      sample({ id: "a1", accepted: true }),
      sample({ id: "r1", accepted: false, sent: "Yes, that works." }),
    ]);

    expect(prompt).toContain("1 sent unchanged, 1 rewritten");
    expect(prompt).toContain("Outcome: SENT UNCHANGED");
    expect(prompt).toContain("Outcome: REWRITTEN");
  });

  it("includes the subject and priority as context", () => {
    const prompt = buildStylePrompt([sample()]);

    expect(prompt).toContain("Subject: Re: Timeline");
    expect(prompt).toContain("Priority: MEDIUM");
  });

  it("says the context is gone rather than omitting the line", () => {
    const prompt = buildStylePrompt([sample({ subject: null, priority: null })]);

    expect(prompt).toContain("Context: (summary no longer available)");
  });

  it("truncates a pasted-forward thread", () => {
    const long = "word ".repeat(2000);
    const prompt = buildStylePrompt([sample({ sent: long, accepted: false })]);

    expect(prompt.length).toBeLessThan(long.length);
    expect(prompt).toContain("…");
  });
});

describe("summarizeStyleSamples", () => {
  it("refuses to build a note from too little history", () => {
    const tooFew = many(MIN_SAMPLES_FOR_STYLE - 1, true);

    expect(summarizeStyleSamples(tooFew)).toBeNull();
  });

  it("counts both outcomes once there is enough", () => {
    const summary = summarizeStyleSamples([...many(3, true), ...many(4, false)]);

    expect(summary).toEqual({ sampleCount: 7, acceptedCount: 3, rewriteCount: 4 });
  });
});

describe("parseStyleNote", () => {
  it("reads the note out of a well-formed response", () => {
    const note = "Short sentences, no greeting, blunt openers.";

    expect(parseStyleNote(JSON.stringify({ styleNote: note }))).toBe(note);
  });

  it("accepts a payload with a trailing newline", () => {
    const note = "Short sentences, no greeting, blunt openers.";

    expect(parseStyleNote(`${JSON.stringify({ styleNote: note })}\n`)).toBe(note);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["not JSON", "Sounds fine to me"],
    ["an array", "[]"],
    ["a bare string", JSON.stringify("short replies")],
    ["a missing field", JSON.stringify({ note: "something" })],
    ["a non-string field", JSON.stringify({ styleNote: 42 })],
    ["too short to be useful", JSON.stringify({ styleNote: "Be brief." })],
  ])("rejects %s rather than storing junk", (_label, raw) => {
    // A near-empty or malformed note gets injected into the drafting prompt as
    // an instruction, where it is worse than no instruction at all.
    expect(parseStyleNote(raw)).toBeNull();
  });
});

describe("clampStyleNote", () => {
  it("leaves a normal note alone", () => {
    const note = "Short sentences, no greeting, blunt openers.";

    expect(clampStyleNote(note)).toBe(note);
  });

  it("caps a runaway generation", () => {
    const clamped = clampStyleNote("word ".repeat(5000));

    expect(clamped.length).toBeLessThan(2100);
    expect(clamped.endsWith("…")).toBe(true);
  });
});
