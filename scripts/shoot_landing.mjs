/**
 * 落地页截图（开发辅助）。
 *
 * 用 CDP 打开 docs/ 的静态服务，截取整页 + 首屏，用于人工核对排版。
 * 与 shoot_docs.mjs 同样依赖已启动的 headless Chrome（--remote-debugging-port=9222）。
 *
 * 用法：node scripts/shoot_landing.mjs [url] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_ = process.argv[2] || "http://localhost:4180/";
const OUT_DIR = process.argv[3] || path.resolve(HERE, "..", ".zwork", "landing");
const CDP_PORT = 9222;

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

  // 首屏：按常见桌面视口
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: URL_ });
  await sleep(2000);

  const hero = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(OUT_DIR, "landing-hero.png"),
    Buffer.from(hero.data, "base64")
  );
  console.log("  landing-hero.png");

  // 整页
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const h = Math.ceil(metrics.cssContentSize.height);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: Math.min(h, 8000),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(1200);
  const full = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  fs.writeFileSync(
    path.join(OUT_DIR, "landing-full.png"),
    Buffer.from(full.data, "base64")
  );
  console.log(`  landing-full.png (高 ${h}px)`);

  // 移动端视口
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: URL_ });
  await sleep(1800);
  const mob = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(OUT_DIR, "landing-mobile.png"),
    Buffer.from(mob.data, "base64")
  );
  console.log("  landing-mobile.png");

  ws.close();
  console.log(`完成 -> ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("截图失败:", e.message);
  process.exit(1);
});
