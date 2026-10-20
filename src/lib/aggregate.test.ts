import { describe, expect, it } from "vitest";
import {
  categorizeProcesses,
  countBy,
  cpuHistogram,
  frameworkDistribution,
  isPieWorthRendering,
  isProjectRunning,
  memoryHistogram,
  portDistribution,
  totalMessageCount,
  toolUsageDistribution,
} from "./aggregate";
import type { DevServer, ProcInfo, SessionFilePreview } from "../types";

const proc = (over: Partial<ProcInfo>): ProcInfo => ({
  pid: 1,
  name: "app.exe",
  exe_path: "C:\\app.exe",
  cmd_line: "",
  argv: [],
  cwd: "",
  cpu: 0,
  memory: 0,
  parent_pid: null,
  status: "运行中",
  start_time: 0,
  ...over,
});

describe("bucketize 系列", () => {
  it("CPU 分桶边界：0.5 落入 <5%，50 落入 50%+", () => {
    const bins = cpuHistogram([
      proc({ cpu: 0 }),
      proc({ cpu: 0.5 }),
      proc({ cpu: 4.9 }),
      proc({ cpu: 50 }),
      proc({ cpu: 99 }),
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 2, 0, 0, 2]);
  });

  it("内存按 MB 分桶（1GB 边界归入 1GB+）", () => {
    const bins = memoryHistogram([
      proc({ memory: 5 * 1024 * 1024 }),
      proc({ memory: 600 * 1024 * 1024 }),
      proc({ memory: 1024 * 1024 * 1024 }),
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 0, 0, 1, 1]);
  });

  it("端口分布包含 65535 上界，且不吞掉 0", () => {
    const labels = ["well-known", "registered", "dynamic"];
    const bins = portDistribution(
      [
        { local_port: 80 },
        { local_port: 3000 },
        { local_port: 65535 },
        { local_port: 0 },
      ],
      labels
    );
    expect(bins.map((b) => b.label)).toEqual(labels);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1]);
  });
});

describe("countBy / 分布", () => {
  it("按数量降序排列", () => {
    expect(countBy(["a", "b", "b", "c", "c", "c"], (x) => x)).toEqual([
      ["c", 3],
      ["b", 2],
      ["a", 1],
    ]);
  });

  it("框架分布与工具分布共用同一计数语义", () => {
    const devs = [
      { framework: "Vite" },
      { framework: "Vite" },
      { framework: "Next.js" },
    ] as DevServer[];
    expect(frameworkDistribution(devs)).toEqual([
      ["Vite", 2],
      ["Next.js", 1],
    ]);
    expect(toolUsageDistribution(["read", "read", "bash"])).toEqual([
      ["read", 2],
      ["bash", 1],
    ]);
  });
});

describe("categorizeProcesses", () => {
  const names = {
    browser: "浏览器",
    dev: "开发",
    ai: "AI",
    system: "系统",
    other: "其他",
  };

  it("按 token 边界分类，不误判子串（google 不算 go、sample 不算 amp）", () => {
    const cats = categorizeProcesses(
      [
        proc({ name: "chrome.exe" }),
        proc({ name: "google.exe" }),
        proc({ name: "sample.exe" }),
        proc({ name: "claude.exe" }),
      ],
      names
    );
    const byKey = Object.fromEntries(cats.map((c) => [c.key, c.count]));
    expect(byKey.browser).toBe(1);
    expect(byKey.ai).toBe(1);
    expect(byKey.other).toBe(2);
    expect(byKey.dev).toBeUndefined();
  });

  it("空进程列表返回空数组（不产出 0 值分类）", () => {
    expect(categorizeProcesses([], names)).toEqual([]);
  });

  it("内存按分类累加", () => {
    const cats = categorizeProcesses(
      [
        proc({ name: "chrome.exe", memory: 100 }),
        proc({ name: "msedge.exe", memory: 50 }),
      ],
      names
    );
    expect(cats[0]).toMatchObject({ key: "browser", count: 2, mem: 150 });
  });
});

describe("isProjectRunning", () => {
  it("路径分隔符与大小写不敏感", () => {
    expect(isProjectRunning("C:\\proj\\shop-web", ["c:/proj/shop-web"])).toBe(true);
  });

  it("前缀相同但不是子目录时不算运行（shop-web-old 不应命中 shop-web）", () => {
    expect(isProjectRunning("C:\\proj\\shop-web", ["C:\\proj\\shop-web-old"])).toBe(
      false
    );
  });

  it("子目录算运行", () => {
    expect(
      isProjectRunning("C:\\proj\\shop-web", ["C:\\proj\\shop-web\\packages\\ui"])
    ).toBe(true);
  });

  it("空项目路径或空运行目录不命中", () => {
    expect(isProjectRunning("", ["C:\\proj"])).toBe(false);
    expect(isProjectRunning("C:\\proj", [null, undefined, ""])).toBe(false);
  });
});

describe("totalMessageCount", () => {
  it("累加会话文件消息数", () => {
    const files = [{ message_count: 3 }, { message_count: 5 }] as SessionFilePreview[];
    expect(totalMessageCount(files)).toBe(8);
  });

  it("空列表为 0", () => {
    expect(totalMessageCount([])).toBe(0);
  });
});

describe("isPieWorthRendering", () => {
  // 单分类饼图是一个满圆（永远 100%），不传达任何信息
  it("少于两个分类时不画饼图", () => {
    expect(isPieWorthRendering([])).toBe(false);
    expect(isPieWorthRendering([["Vite", 3]])).toBe(false);
  });

  it("分类够但值全为 0 时不画（例如成本全是未定价的 $0）", () => {
    expect(
      isPieWorthRendering([
        ["claude-sonnet-4-5", 0],
        ["gpt-4o", 0],
        ["unknown", 0],
      ])
    ).toBe(false);
  });

  it("只有一个分类非零时也不画", () => {
    expect(
      isPieWorthRendering([
        ["Vite", 5],
        ["Next.js", 0],
      ])
    ).toBe(false);
  });

  it("两个及以上分类时画饼图", () => {
    expect(
      isPieWorthRendering([
        ["Vite", 3],
        ["Next.js", 1],
      ])
    ).toBe(true);
  });
});
