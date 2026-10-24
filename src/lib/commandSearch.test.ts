import { describe, expect, it } from "vitest";
import { fuzzyScore, rankCommands } from "./commandSearch";

describe("fuzzyScore", () => {
  it("returns 0 when characters are missing or out of order", () => {
    expect(fuzzyScore("zzz", "processes")).toBe(0);
    expect(fuzzyScore("ps", "processes")).toBeGreaterThan(0);
    expect(fuzzyScore("sp", "processes")).toBe(0);
  });

  it("rewards prefix and word-boundary matches", () => {
    expect(fuzzyScore("proc", "Processes")).toBeGreaterThan(
      fuzzyScore("proc", "All processes")
    );
    expect(fuzzyScore("cost", "Cost ledger")).toBeGreaterThan(
      fuzzyScore("cost", "A cost ledger")
    );
  });

  it("is case insensitive", () => {
    expect(fuzzyScore("COST", "costs")).toBeGreaterThan(0);
  });
});

describe("rankCommands", () => {
  const items = [
    { id: "a", label: "Overview", keywords: "dashboard home" },
    { id: "b", label: "Cost ledger", keywords: "spend budget" },
    { id: "c", label: "Processes", keywords: "cpu memory" },
  ];

  it("keeps registration order for an empty query", () => {
    expect(rankCommands(items, "").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("puts the best match first", () => {
    expect(rankCommands(items, "cost").map((x) => x.id)).toEqual(["b"]);
  });

  it("searches keywords too", () => {
    expect(rankCommands(items, "budget").map((x) => x.id)).toEqual(["b"]);
  });

  it("respects the limit", () => {
    expect(rankCommands(items, "", 2)).toHaveLength(2);
  });
});
