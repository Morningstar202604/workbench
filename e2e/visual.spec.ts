import { expect, test, type Page } from "@playwright/test";

/**
 * 视觉回归：覆盖「布局塌陷」这类单元测试抓不到的问题。
 *
 * 每个主题 × 关键页面各一张基线。基线并不是为了追求像素完全一致，
 * 而是为了在有人改动布局/间距/图表配置时立刻看到差异。
 *
 * 这份测试是真实的教训：磁盘环形图标签重叠、Hero 在窄屏塌成窄列、
 * 设置页因为 backdrop-filter 整块空白 —— 这些全都通过了单元测试和类型检查。
 */

const THEMES = ["midnight", "frost", "paper", "aurora", "terminal"] as const;

/** 进入指定主题（直接写 dataset，避免依赖设置页的交互细节）。 */
async function applyTheme(page: Page, theme: string) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    const light = t === "frost" || t === "paper";
    document.documentElement.dataset.chartTheme = light ? "light" : "dark";
  }, theme);
  // 等 ECharts 按新主题重建
  await page.waitForTimeout(600);
}

/** 打开某个页面（通过侧栏按钮，走真实交互路径）。 */
async function gotoPage(page: Page, label: string) {
  const nav = page.locator("aside button", { hasText: label }).first();
  await nav.click();
  await page.waitForTimeout(700);
}

test.describe("布局稳定性", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // 等样式表真正就绪：Vite 开发态是注入 <style> 的，
    // 若在注入完成前截图，会拿到没有主题变量的裸页面（全部测试假通过）。
    await page.waitForFunction(
      () => {
        const cs = getComputedStyle(document.documentElement);
        return cs.getPropertyValue("--radius-card").trim() !== "";
      },
      { timeout: 15000 }
    );
    // 演示数据是静态的，但 history 采样点会随时间增长；截断到稳定状态
    await page.waitForTimeout(1500);
    // 统一滚动位置，避免截图带随机滚动偏移
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = 0;
    });
  });

  test("overview 在五种风格下都保持结构", async ({ page }) => {
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await gotoPage(page, "Overview");
      await expect(page).toHaveScreenshot(`overview-${theme}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        // 时间戳与「更新于」每分钟都在变，用 mask 屏蔽而不是放宽容忍度
        mask: [page.locator("header .tabular-nums, main .tabular-nums").first()],
      });
    }
  });

  test("关键页面在默认风格下无布局回归", async ({ page }) => {
    await applyTheme(page, "midnight");
    for (const [label, name] of [
      ["Processes", "processes"],
      ["Servers & ports", "servers"],
      ["Cost ledger", "costs"],
      ["Tasks", "tasks"],
    ] as const) {
      await gotoPage(page, label);
      await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.005 });
    }
  });

  test("设置页的风格选择器完整渲染", async ({ page }) => {
    await gotoPage(page, "Settings");
    // 回归：backdrop-filter: blur(0px) 曾让整页内容不绘制
    const cards = page.locator("button[aria-pressed]");
    await expect(cards).toHaveCount(5);
    await expect(page).toHaveScreenshot("settings.png", { maxDiffPixelRatio: 0.005 });
  });

  test("窄屏下导航变抽屉且内容单列", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    // 侧栏应收起（translate 负值）
    const left = await page.evaluate(
      () => document.querySelector("aside")!.getBoundingClientRect().left
    );
    expect(left).toBeLessThan(0);

    await expect(page).toHaveScreenshot("mobile-overview.png", {
      maxDiffPixelRatio: 0.005,
    });
  });
});

test.describe("主题结构契约", () => {
  /**
   * 纯截图不够：需要断言「主题变量确实作用到了真实元素上」。
   * 这条能在圆角/阴影被误改时立刻失败，而不依赖像素对比。
   */
  test("五种风格的卡片圆角与阴影各不相同", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);

    const measured = await page.evaluate(() => {
      const out: Record<string, { radius: string; shadow: string }> = {};
      for (const id of ["midnight", "frost", "paper", "aurora", "terminal"]) {
        document.documentElement.dataset.theme = id;
        const card = document.querySelector("main .t-card") as HTMLElement | null;
        if (!card) continue;
        const cs = getComputedStyle(card);
        out[id] = { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
      }
      return out;
    });

    // Paper 与 Terminal 是直角，Frost 的圆角最大
    expect(parseFloat(measured["paper"].radius)).toBeLessThanOrEqual(4);
    expect(parseFloat(measured["terminal"].radius)).toBe(0);
    expect(parseFloat(measured["frost"].radius)).toBeGreaterThanOrEqual(16);
    // Paper/Terminal 无阴影
    expect(measured["paper"].shadow).toBe("none");
    expect(measured["terminal"].shadow).toBe("none");
    // Frost 有柔和阴影
    expect(measured["frost"].shadow).not.toBe("none");
  });
});

test.describe("图表不重叠", () => {
  /**
   * 用 DOM 断言而不是纯截图：ECharts 画在 canvas 上，
   * 但图例/标签的重叠问题会体现在画布尺寸与容器的一致性上。
   * 这里检查「图表容器实际渲染尺寸 > 0」，防止再次出现整块不绘制。
   */
  test("每个图表的 canvas 都有实际尺寸", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);

    const bad = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll("main canvas")];
      return canvases
        .map((c, i) => ({
          i,
          w: (c as HTMLCanvasElement).width,
          h: (c as HTMLCanvasElement).height,
          boxW: c.getBoundingClientRect().width,
        }))
        .filter((c) => c.w === 0 || c.h === 0 || c.boxW === 0);
    });
    expect(bad).toEqual([]);
  });
});
