/**
 * 本地复跑 CI。
 *
 * 为什么需要它：`act` 只能跑容器化的 job，而本项目的 CI 全是
 * `windows-latest` / `ubuntu-latest` 原生 runner；Windows 侧的两条 job
 * 其实可以在本机一条命令跑完，没必要等远端排期。
 *
 * 与 .github/workflows/ci.yml 的关系：命令逐条对齐（顺序也一致），
 * 任一步失败立即退出，并打印「哪一步 / 哪条命令 / 退出码」。
 * 这个脚本是**本地镜像**，不是替代：Linux 的 deb 打包、macOS 构建
 * 仍然只能在对应 runner 上跑（`--linux` 会尝试用 Docker，没有则跳过并说明）。
 *
 * 用法：
 *   node scripts/ci-local.mjs            # 全部可在 Windows 本地跑的步骤
 *   node scripts/ci-local.mjs --fast     # 跳过耗时最长的 Playwright 视觉回归
 *   node scripts/ci-local.mjs --linux    # 额外尝试在 Docker 里跑 Rust 测试
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const FAST = process.argv.includes("--fast");
const LINUX = process.argv.includes("--linux");

const steps = [
  { name: "Icon contract", cmd: "python", args: ["scripts/check_icons.py"] },
  { name: "Typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "Lint", cmd: "npm", args: ["run", "lint"] },
  { name: "Format check", cmd: "npx", args: ["prettier", "--check", "."] },
  { name: "Unit tests", cmd: "npm", args: ["test"] },
  { name: "Build", cmd: "npm", args: ["run", "build"] },
  {
    name: "Visual regression",
    cmd: "npx",
    args: ["playwright", "test", "--workers=1"],
    skip: FAST,
  },
  {
    name: "Rust format",
    cmd: "cargo",
    args: ["fmt", "--all", "--", "--check"],
    cwd: "src-tauri",
  },
  { name: "Rust tests", cmd: "cargo", args: ["test"], cwd: "src-tauri" },
  {
    name: "Rust clippy",
    cmd: "cargo",
    args: ["clippy", "--all-targets", "--", "-D", "warnings"],
    cwd: "src-tauri",
  },
  {
    name: "IPC contract drift",
    cmd: "cargo",
    args: ["test", "--test", "export_bindings"],
    cwd: "src-tauri",
    after: checkContractDrift,
  },
];

function checkContractDrift() {
  const r = spawnSync("git", ["status", "--porcelain", "--", "src/generated"], {
    encoding: "utf8",
  });
  if (r.stdout.trim()) {
    console.error("  src/generated 与 Rust 结构体不一致：");
    console.error(r.stdout.trim());
    console.error("  修复：cd src-tauri && cargo test --test export_bindings");
    return false;
  }
  return true;
}

function run(step) {
  const started = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    cwd: step.cwd ?? ".",
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CI: "true" },
  });
  const ms = Date.now() - started;
  if (r.status !== 0) {
    console.error(`\nFAIL ${step.name}（exit ${r.status}, ${(ms / 1000).toFixed(1)}s）`);
    console.error(
      `  命令: ${step.cmd} ${step.args.join(" ")}${step.cwd ? `（在 ${step.cwd}/）` : ""}`
    );
    return false;
  }
  if (step.after && !step.after()) {
    console.error(`\nFAIL ${step.name}（后置检查未通过）`);
    return false;
  }
  console.log(`ok   ${step.name}（${(ms / 1000).toFixed(1)}s）`);
  return true;
}

let failed = 0;
let skipped = 0;
for (const step of steps) {
  if (step.skip) {
    console.log(`skip ${step.name}（--fast）`);
    skipped++;
    continue;
  }
  if (!run(step)) {
    failed++;
    break;
  }
}

if (LINUX) {
  // Linux job 只能在 Linux 上跑。这里用 Docker 试一次；没有可用的
  // Docker 就明确说明「本地无法覆盖」，而不是假装通过。
  const docker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
  });
  if (docker.status === 0) {
    console.log("\nDocker 可用：在 ubuntu:24.04 里跑 Rust 测试（对齐 backend-linux）");
    const r = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${process.cwd()}:/w`,
        "-w",
        "/w/src-tauri",
        "ubuntu:24.04",
        "bash",
        "-lc",
        "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl build-essential pkg-config libssl-dev libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev >/dev/null && curl -sSf https://sh.rustup.rs | sh -s -- -y >/dev/null && . $HOME/.cargo/env && cargo test",
      ],
      { stdio: "inherit" }
    );
    if (r.status !== 0) failed++;
  } else {
    console.log("\nskip Linux job（Docker 守护进程不可用）");
    console.log("  这一步无法在本地覆盖；由 GitHub Actions 的 ubuntu-latest 负责。");
    skipped++;
  }
}

console.log(
  `\n${failed ? "FAILED" : "PASSED"}：${steps.length - skipped} 步通过，${skipped} 步跳过，${failed} 步失败`
);
process.exit(failed ? 1 : 0);
