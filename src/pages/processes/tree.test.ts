import { describe, expect, it } from "vitest";
import { buildForest, flattenTree, type TreeRow } from "./tree";
import type { ProcInfo } from "../../types";

function proc(pid: number, parent: number | null, cpu = 0, name = `p${pid}`): ProcInfo {
  return {
    pid,
    name,
    exe_path: "",
    cmd_line: "",
    argv: [],
    cwd: "",
    cpu,
    memory: 0,
    parent_pid: parent,
    status: "Run",
    start_time: 0,
  };
}

describe("buildForest", () => {
  it("nests children under their parent", () => {
    const roots = buildForest([proc(1, null), proc(2, 1), proc(3, 2)]);
    expect(roots).toHaveLength(1);
    expect(roots[0].p.pid).toBe(1);
    expect(roots[0].children[0].p.pid).toBe(2);
    expect(roots[0].children[0].children[0].p.pid).toBe(3);
  });

  it("treats a missing parent as a root", () => {
    const roots = buildForest([proc(7, 999)]);
    expect(roots.map((n) => n.p.pid)).toEqual([7]);
  });

  it("breaks a two-node cycle without dropping either node", () => {
    const roots = buildForest([proc(1, 2), proc(2, 1)]);
    const ids = roots.flatMap((n) => [n.p.pid, ...n.children.map((c) => c.p.pid)]).sort();
    expect(ids).toEqual([1, 2]);
  });

  it("treats a self-parent as a root", () => {
    const roots = buildForest([proc(4, 4)]);
    expect(roots.map((n) => n.p.pid)).toEqual([4]);
  });

  it("sorts siblings by the active sort key", () => {
    const roots = buildForest([proc(1, null), proc(2, 1, 5), proc(3, 1, 40)], "cpu");
    expect(roots[0].children.map((c) => c.p.pid)).toEqual([3, 2]);
  });
});

describe("flattenTree", () => {
  const forest = buildForest([proc(1, null), proc(2, 1), proc(3, 2), proc(4, 1)]);

  it("emits rows in depth-first order with depth and child flags", () => {
    const rows = flattenTree(forest, new Set([1, 2]));
    expect(rows.map((r) => [r.p.pid, r.depth, r.hasChildren])).toEqual([
      [1, 0, true],
      [2, 1, true],
      [3, 2, false],
      [4, 1, false],
    ]);
  });

  it("hides descendants of a collapsed node", () => {
    const rows = flattenTree(forest, new Set([1]));
    expect(rows.map((r) => r.p.pid)).toEqual([1, 2, 4]);
  });

  it("emits only roots when nothing is expanded", () => {
    const rows = flattenTree(forest, new Set());
    expect(rows.map((r) => r.p.pid)).toEqual([1]);
  });

  it("marks depth on each row", () => {
    const rows: TreeRow[] = flattenTree(forest, new Set([1, 2]));
    expect(rows.find((r) => r.p.pid === 3)?.depth).toBe(2);
  });
});
