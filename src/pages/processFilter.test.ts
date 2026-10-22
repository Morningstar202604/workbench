import { describe, expect, it } from "vitest";
import { filterProcs, type ProcFilter } from "./processFilter";
import type { ProcInfo } from "../types";

const p = (over: Partial<ProcInfo>): ProcInfo => ({
  pid: 1,
  name: "node.exe",
  cmd_line: "node index.js",
  exe_path: "C:\\Program Files\\node.exe",
  cpu: 5,
  memory: 100,
  status: "running",
  start_time: 1,
  parent_pid: 0,
  argv: [],
  cwd: "",
  ...over,
});

const base: ProcFilter = {
  query: "",
  chip: "all",
  sort: "cpu",
  aiPids: new Set([2]),
  devPids: new Set([3]),
};

describe("filterProcs", () => {
  const procs = [
    p({ pid: 1, name: "node.exe", cpu: 5 }),
    p({ pid: 2, name: "claude.exe", cpu: 40, cmd_line: "claude --resume" }),
    p({ pid: 3, name: "vite", cpu: 12, cmd_line: "vite --port 5173" }),
  ];

  it("默认按 CPU 降序", () => {
    expect(filterProcs(procs, base).map((x) => x.pid)).toEqual([2, 3, 1]);
  });

  it("按 PID / 名称排序", () => {
    expect(filterProcs(procs, { ...base, sort: "pid" }).map((x) => x.pid)).toEqual([
      1, 2, 3,
    ]);
    expect(filterProcs(procs, { ...base, sort: "name" })[0].name).toBe("claude.exe");
  });

  it("AI / DEV 胶囊只保留对应 PID", () => {
    expect(filterProcs(procs, { ...base, chip: "ai" }).map((x) => x.pid)).toEqual([2]);
    expect(filterProcs(procs, { ...base, chip: "dev" }).map((x) => x.pid)).toEqual([3]);
  });

  it("搜索覆盖名称、PID、命令行与可执行路径", () => {
    expect(filterProcs(procs, { ...base, query: "CLAUDE" }).map((x) => x.pid)).toEqual([
      2,
    ]);
    expect(filterProcs(procs, { ...base, query: "5173" }).map((x) => x.pid)).toEqual([3]);
    // "1" 命中 pid=1 与 5173（pid 3），按 CPU 降序
    expect(filterProcs(procs, { ...base, query: "1" }).map((x) => x.pid)).toEqual([3, 1]);
    expect(filterProcs(procs, { ...base, query: "program files" })).toHaveLength(3);
  });

  it("胶囊与搜索叠加时取交集", () => {
    expect(
      filterProcs(procs, { ...base, chip: "ai", query: "vite" }).map((x) => x.pid)
    ).toEqual([]);
    expect(
      filterProcs(procs, { ...base, chip: "ai", query: "claude" }).map((x) => x.pid)
    ).toEqual([2]);
  });

  it("不改动入参数组的顺序", () => {
    const input = [...procs];
    filterProcs(input, { ...base, sort: "pid" });
    expect(input.map((x) => x.pid)).toEqual([1, 2, 3]);
  });
});
