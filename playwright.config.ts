import { defineConfig, devices } from "@playwright/test";

/**
 * 视觉回归测试配置。
 *
 * 设计取舍：
 * - **只在 Chromium 上跑**：跨浏览器字体渲染差异会让基线永远不稳，
 *   而我们的目标是「捕获布局回归」，不是跨浏览器像素一致性。
 * - **阈值 0.005**（约 6500 像素 / 1440×900）：这是跨平台基线共享后的折中。
 *   实测：0.02 抓不到「圆角 12px→0」（测试变摆设），0.002 在 Windows 本地
 *   与 Linux CI 之间会因字体抗锯齿差异误报。0.005 能捕获背景色变化、
 *   布局塌陷、元素消失这类真问题（已用「背景改红」反向验证过：4 个测试失败）。
 *   时间戳这类每帧都变的区域用 `mask` 屏蔽，而不是靠放宽容忍度。
 * - **固定 viewport + 关闭动画**：动画中间帧不可复现。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  /*
   * 基线文件名带平台后缀（-win32 / -linux）是 Playwright 的默认策略。
   * 但 Windows 与 Linux 的字体渲染差异很大，同一份基线的像素差通常在 1-3%，
   * 会稳定超过阈值。这里把平台后缀固定成 `chromium`，
   * 并且**只在 Linux CI 上维护基线**（见 README 的说明），
   * 本地 Windows 跑时用 snapshotPathTemplate 也能对齐同一份基线。
   *
   * 代价：本地 Windows 与 CI Linux 的渲染差异会吃掉一部分容忍度，
   * 因此阈值不能压到 0.0005 以下。
   */
  snapshotPathTemplate:
    "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // 固定时区与语言，避免日期文案随机器变化
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  /*
   * 用**构建产物 + preview** 而不是 dev server。
   * 开发态是 HMR 注入 <style>，改动后样式表被热替换，截图可能落在
   * 新旧样式的中间态；构建产物是静态文件，与用户实际看到的一致，
   * 也让「故意改坏样式」这种验证能真正生效。
   */
  webServer: {
    command:
      "npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
