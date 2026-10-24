import { describe, expect, it } from "vitest";
import { statusKeyOf } from "./processStatus";

describe("statusKeyOf", () => {
  it("maps canonical sysinfo keys", () => {
    expect(statusKeyOf("Run")).toBe("run");
    expect(statusKeyOf("Sleep")).toBe("sleep");
    expect(statusKeyOf("Zombie")).toBe("zombie");
    expect(statusKeyOf("UninterruptibleDiskSleep")).toBe("diskSleep");
  });

  it("maps legacy localized values from older builds", () => {
    expect(statusKeyOf("运行中")).toBe("run");
    expect(statusKeyOf("休眠")).toBe("sleep");
    expect(statusKeyOf("僵尸")).toBe("zombie");
  });

  it("falls back to unknown", () => {
    expect(statusKeyOf("SomethingNew")).toBe("unknown");
    expect(statusKeyOf("")).toBe("unknown");
  });
});
