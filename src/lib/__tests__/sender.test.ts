import { describe, it, expect } from "vitest";

import { extractSenderAddress, extractSenderName } from "../sender";

describe("extractSenderAddress", () => {
  it("pulls the address out of the display-name form", () => {
    expect(extractSenderAddress("Ada Lovelace <ada@example.com>")).toBe(
      "ada@example.com",
    );
  });

  it("accepts a bare address", () => {
    expect(extractSenderAddress("noreply@example.com")).toBe("noreply@example.com");
  });

  it("lowercases so casing variants do not split one sender in two", () => {
    expect(extractSenderAddress("Ada <Ada@Example.COM>")).toBe("ada@example.com");
    expect(extractSenderAddress("ADA@EXAMPLE.COM")).toBe("ada@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(extractSenderAddress("  ada@example.com  ")).toBe("ada@example.com");
  });

  it("takes the last token when a display name is glued on", () => {
    expect(extractSenderAddress("Ada Lovelace ada@example.com")).toBe(
      "ada@example.com",
    );
  });

  it("strips a quoted display name", () => {
    expect(extractSenderAddress('"Lovelace, Ada" <ada@example.com>')).toBe(
      "ada@example.com",
    );
  });

  it("handles a subdomain and a plus-addressed tag", () => {
    expect(
      extractSenderAddress("News <news+weekly@mail.example.co.uk>"),
    ).toBe("news+weekly@mail.example.co.uk");
  });

  it("returns null when there is no usable address", () => {
    expect(extractSenderAddress("")).toBeNull();
    expect(extractSenderAddress("   ")).toBeNull();
    expect(extractSenderAddress("Ada Lovelace")).toBeNull();
    expect(extractSenderAddress("no-at-sign.example.com")).toBeNull();
    expect(extractSenderAddress("<@example.com>")).toBeNull();
    expect(extractSenderAddress("<ada@>")).toBeNull();
    expect(extractSenderAddress("<ada@example.com.>")).toBeNull();
  });
});

describe("extractSenderName", () => {
  it("returns the display name from the bracketed form", () => {
    expect(extractSenderName("Ada Lovelace <ada@example.com>")).toBe("Ada Lovelace");
  });

  it("unwraps a quoted name", () => {
    expect(extractSenderName('"Lovelace, Ada" <ada@example.com>')).toBe(
      "Lovelace, Ada",
    );
  });

  it("returns null for a bare address rather than passing it off as a name", () => {
    // The banner falls back to the address itself; labelling an address as
    // somebody's name reads as a bug.
    expect(extractSenderName("ada@example.com")).toBeNull();
  });

  it("returns null for an empty display name", () => {
    expect(extractSenderName("<ada@example.com>")).toBeNull();
    expect(extractSenderName("   ")).toBeNull();
  });
});
