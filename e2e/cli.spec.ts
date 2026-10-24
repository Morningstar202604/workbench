import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * CLI 契约测试：直接跑**打包后的 exe**，验证 stdout、退出码与 JSON 结构。
 *
 * 为什么不用单元测试替代：Windows GUI 子系统程序的 stdout 在重定向、
 * 管道、控制台三种启动方式下行为不同，单元测试测不到。这里用真实二进制
 * 跑真实子进程——这条曾经抓到「--version > file 得到空文件」。
 */

const EXE = path.resolve("src-tauri/target/release/workbench.exe");

function run(args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(EXE, args, {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number | null };
    return { out: err.stdout ?? "", code: err.status ?? 1 };
  }
}

test.describe("CLI", () => {
  // 需要先 `npm run tauri build`：CI 的 frontend job 没有 release 二进制，
  // 那里跳过而不是失败；本机与发布验证时才有意义。
  test.skip(
    process.platform !== "win32" || !existsSync(EXE),
    "requires a packaged Windows binary (npm run tauri build)"
  );

  test("--version prints one line and exits 0", () => {
    const { out, code } = run(["--version"]);
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^workbench \d+\.\d+\.\d+$/);
  });

  test("--help lists every command", () => {
    const { out } = run(["--help"]);
    for (const cmd of ["ps", "ports", "diag", "--json"]) {
      expect(out).toContain(cmd);
    }
  });

  test("unknown command exits 2", () => {
    const { code, out } = run(["nope"]);
    expect(code).toBe(2);
    expect(out).toContain("未知命令");
  });

  test("ports --json is a JSON array of port entries", () => {
    const { out, code } = run(["ports", "--json"]);
    expect(code).toBe(0);
    const rows = JSON.parse(out) as Array<Record<string, unknown>>;
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length) {
      expect(rows[0]).toHaveProperty("local_port");
      expect(rows[0]).toHaveProperty("protocol");
      expect(typeof rows[0].pid).toBe("number");
    }
  });

  test("diag --json reports every check with a level", () => {
    const { out, code } = run(["diag", "--json"]);
    expect(code).toBe(0);
    const report = JSON.parse(out) as {
      checks: { id: string; level: string }[];
      ok_count: number;
    };
    expect(report.checks.length).toBeGreaterThan(3);
    for (const c of report.checks) {
      expect(["ok", "warn", "fail"]).toContain(c.level);
    }
    expect(report.ok_count).toBeGreaterThan(0);
  });
});
