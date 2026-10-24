import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./export";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("chrome.exe")).toBe("chrome.exe");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a"b,c')).toBe('"a""b,c"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises formula injection", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and ends with a newline", () => {
    expect(
      toCsv([
        ["a", "b"],
        [1, 2],
      ])
    ).toBe("a,b\r\n1,2\r\n");
  });
});
