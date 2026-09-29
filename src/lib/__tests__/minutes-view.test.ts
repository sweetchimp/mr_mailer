import { describe, it, expect } from "vitest";

import {
  parseStringList,
  parseActionItems,
  splitAttendees,
} from "../minutes-view";

describe("parseStringList", () => {
  it("treats the absent and empty columns as no items", () => {
    expect(parseStringList(null)).toEqual([]);
    expect(parseStringList("")).toEqual([]);
  });

  it("treats an empty JSON array as no items", () => {
    expect(parseStringList("[]")).toEqual([]);
  });

  it("reads a JSON array of strings", () => {
    expect(parseStringList('["Ship on Friday","Cancel the vendor"]')).toEqual([
      "Ship on Friday",
      "Cancel the vendor",
    ]);
  });

  it("drops non-string members and trims the rest", () => {
    expect(parseStringList('["  Ship it  ",42,null,{"task":"no"},{}]')).toEqual([
      "Ship it",
    ]);
  });

  // The regression: a column that isn't JSON at all previously threw inside the
  // page render, which 500'd the detail view and took the whole list with it.
  it("falls back to newline splitting when the column is not JSON", () => {
    expect(parseStringList("Ship on Friday\n- Cancel the vendor")).toEqual([
      "Ship on Friday",
      "Cancel the vendor",
    ]);
  });

  it("returns nothing when the column holds JSON that is not an array", () => {
    // Line-splitting a parsed object would render the raw JSON as a decision.
    expect(parseStringList('{"decisions":"Ship it"}')).toEqual([]);
  });
});

describe("parseActionItems", () => {
  it("treats the absent and empty columns as no items", () => {
    expect(parseActionItems(null)).toEqual([]);
    expect(parseActionItems("")).toEqual([]);
    expect(parseActionItems("[]")).toEqual([]);
  });

  it("reads the { task, owner } contract", () => {
    expect(
      parseActionItems(
        '[{"task":"Finalize the Q3 budget","owner":"Priya"},{"task":"Book the room","owner":null}]',
      ),
    ).toEqual([
      { task: "Finalize the Q3 budget", owner: "Priya" },
      { task: "Book the room", owner: null },
    ]);
  });

  it("normalizes a blank or non-string owner to null rather than rendering it", () => {
    expect(
      parseActionItems('[{"task":"Draft the memo","owner":"   "},{"task":"Ping legal","owner":7}]'),
    ).toEqual([
      { task: "Draft the memo", owner: null },
      { task: "Ping legal", owner: null },
    ]);
  });

  it("drops entries with no usable task", () => {
    expect(
      parseActionItems('[{"owner":"Priya"},{"task":"   "},null,17,{"task":"Send the deck"}]'),
    ).toEqual([{ task: "Send the deck", owner: null }]);
  });

  // The regression: rows written before the { task, owner } contract hold bare
  // strings. Dropping them would silently delete real action items.
  it("reads a bare string entry as an unowned task", () => {
    expect(parseActionItems('["Finalize the Q3 budget — Priya"]')).toEqual([
      { task: "Finalize the Q3 budget — Priya", owner: null },
    ]);
  });

  it("falls back to newline splitting when the column is not JSON", () => {
    expect(parseActionItems("Send the deck\n- Book the room")).toEqual([
      { task: "Send the deck", owner: null },
      { task: "Book the room", owner: null },
    ]);
  });

  it("returns nothing when the column holds JSON that is not an array", () => {
    expect(parseActionItems('{"actionItems":["Send the deck"]}')).toEqual([]);
  });
});

describe("splitAttendees", () => {
  it("treats the absent and empty columns as nobody", () => {
    expect(splitAttendees(null)).toEqual([]);
    expect(splitAttendees("")).toEqual([]);
  });

  it("splits on commas and newlines alike", () => {
    expect(splitAttendees("Priya, Ada\nGrace")).toEqual(["Priya", "Ada", "Grace"]);
  });

  it("drops blank entries and trims the rest", () => {
    expect(splitAttendees(" Priya ,, Ada \n\n Grace ")).toEqual([
      "Priya",
      "Ada",
      "Grace",
    ]);
  });

  it("deduplicates case-insensitively", () => {
    expect(splitAttendees("Priya, priya, PRIYA")).toEqual(["Priya"]);
  });
});
