/**
 * README 截图脚本（开发辅助，不参与应用运行）。
 *
 * 用 Chrome DevTools Protocol 打开 `vite preview` 的浏览器演示模式，
 * 逐个切换侧边栏页面并截图到 docs/screenshots/。
 *
 * 为什么必须用演示模式：非 Tauri 环境下 store 注入 src/lib/demo.ts 的静态数据，
 * 其中所有路径都写死为 "[path redacted]"。脚本里有一道断言，页面若没出现
 * "演示" 标记就直接拒绝截图，防止把开发机上的真实进程、项目路径、主机名
 * 截进公开仓库。
 *
 * 前置：
 *   1. npm run build && npm run preview          （启动 http://localhost:4173）
 *   2. chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>
 *
 * 用法：
 *   node scripts/shoot_docs.mjs                    # 默认 http://localhost:4173
 *   node scripts/shoot_docs.mjs http://host:port   # 指定地址
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || "http://localhost:4173";
const OUT_DIR = path.resolve(HERE, "..", "docs", "screenshots");
const CDP_PORT = 9222;
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 1 };

/** 侧边栏顺序，与 src/App.tsx 的 NAV 保持一致 */
const PAGES = [
  { key: "overview", file: "01-overview.png" },
  { key: "processes", file: "02-processes.png" },
  { key: "servers", file: "03-servers.png" },
  { key: "ai", file: "04-ai-sessions.png" },
  { key: "projects", file: "05-projects.png" },
  { key: "tasks", file: "06-tasks.png" },
  { key: "settings", file: "07-settings.png" },
  { key: "logs", file: "08-logs.png" },
];

function httpJson(pathname) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: CDP_PORT, path: pathname }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

/** 极简 CDP 客户端：够用即可，不引入 puppeteer 依赖 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const targets = await httpJson("/json/list");
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("找不到可用的页面 target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.deviceScaleFactor,
    mobile: false,
  });

  await cdp.send("Page.navigate", { url: BASE });
  await sleep(2500);

  // 断言确实处于演示模式：否则拒绝截图，避免泄漏真实数据
  const probe = await cdp.send("Runtime.evaluate", {
    expression: "document.body.innerText.includes('演示')",
    returnByValue: true,
  });
  if (!probe.result.value) {
    throw new Error("未检测到演示模式标记，拒绝截图（防止泄漏真实数据）");
  }

  const keys = PAGES.map((p) => p.key);
  for (const { key, file } of PAGES) {
    const clicked = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const btns = [...document.querySelectorAll('nav button')];
        const idx = ${JSON.stringify(keys)}.indexOf(${JSON.stringify(key)});
        if (!btns[idx]) return false;
        btns[idx].click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) throw new Error(`切换页面失败: ${key}`);

    await sleep(1200); // 等懒加载 chunk 与图表渲染
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(shot.data, "base64"));
    console.log(`  ${file}`);
  }

  ws.close();
  console.log(`完成：${PAGES.length} 张 -> ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("截图失败:", e.message);
  process.exit(1);
});
