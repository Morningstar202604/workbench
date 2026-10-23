import { expect, test, type Page } from "@playwright/test";

/**
 * 视觉回归 + 结构契约。
 *
 * 基线不是追求像素完全一致，而是「有人改布局/间距/图表配置时立刻看到差异」。
 * 这份测试来自真实事故：磁盘环形图标签重叠、Hero 在窄屏塌成窄列、
 * 设置页因 backdrop-filter 整块空白、打包后的 exe 里仍是旧图标 ——
 * 这些全都通过了单元测试和类型检查。
 *
 * 主题现在由**内联 CSS 变量**驱动（用户可编辑），所以不能再靠改 `data-theme`
 * 属性换肤 —— 必须走设置页的真实交互路径，否则测的还是旧实现。
 */

const THEMES = [
  "midnight",
  "frost",
  "paper",
  "aurora",
  "terminal",
  "ink",
  "void",
  "jade",
] as const;

const LAYOUTS = [
  "bento",
  "ledger",
  "orbit",
  "dense",
  "zen",
  "timeline",
  "board",
] as const;
const SHELLS = ["rail", "dock", "zen"] as const;

/** 通过侧栏/顶部坞的导航按钮打开页面（title 在折叠态也有，比文字稳）。 */
async function gotoPage(page: Page, label: string) {
  await page
    .locator(`aside button[title="${label}"], header nav button[title="${label}"]`)
    .first()
    .click();
  await page.waitForTimeout(700);
}

async function gotoAppearance(page: Page) {
  await gotoPage(page, "设置");
  await page.waitForTimeout(300);
}

/** 主题卡片没有稳定 id，用可见名称点击 + 等待应用。 */
async function pickTheme(page: Page, name: string) {
  await gotoAppearance(page);
  await page.locator(`main button[aria-label="${name}"]`).first().click();
  await page.waitForTimeout(450);
  await gotoPage(page, "概览");
}

async function pickLayout(page: Page, id: string) {
  await gotoAppearance(page);
  await page.locator(`button[data-layout="${id}"]`).click();
  await page.waitForTimeout(250);
  await gotoPage(page, "概览");
}

async function pickShell(page: Page, id: string) {
  await gotoAppearance(page);
  await page.locator(`button[data-shell="${id}"]`).click();
  await page.waitForTimeout(350);
}

test.describe("布局稳定性", () => {
  test.beforeEach(async ({ page }) => {
    // 冻结时钟。
    //
    // 不冻结时有两处每秒都在变：标题栏的「更新于 hh:mm:ss」，以及资源曲线
    // 的 X 轴时间标签（演示数据的采样点基于 Date.now()）。它们让同一份代码
    // 两次截图必然不同 —— 第一次跑会假失败，重跑又通过，是最难排查的一类
    // 噪音。装 Clock 之后定时器也不会自己走，页面停在稳定态。
    await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
    // 每个用例从干净偏好开始：布局/主题/组件顺序都会持久化，
    // 否则一条用例改了布局会污染下一条（Playwright 复用同一 origin 的 storage）。
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("workbench-ui-v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await page.waitForFunction(
      () => {
        const cs = getComputedStyle(document.documentElement);
        return cs.getPropertyValue("--radius-card").trim() !== "";
      },
      { timeout: 15000 }
    );
    // 「更新于 12:34:56」每帧都在变。用 CSS 隐藏而不是 screenshot mask：
    // mask 会被画成一块粉色矩形，基线里看不到那里的真实排版。
    await page.addStyleTag({ content: "header .num{visibility:hidden !important}" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = 0;
    });
  });

  // 八套主题 × (设置页→点主题→概览→截图) 单轮约 3s，默认 30s 不够。
  test("overview 在八种主题下都保持结构", async ({ page }) => {
    test.setTimeout(120_000);
    for (const theme of THEMES) {
      await pickTheme(page, themeName(theme));
      await expect(page).toHaveScreenshot(`overview-${theme}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        // 只遮「更新于 12:34:56」这处时间戳；遮 main 里的 .num 会把
        // 指标数字整块涂成粉色掩码，看不出真实渲染结果。
      });
    }
  });

  test("七种概览布局都渲染出同一批组件", async ({ page }) => {
    test.setTimeout(120_000);
    for (const layout of LAYOUTS) {
      await pickLayout(page, layout);
      // 每种布局都必须至少渲染「关键指标」，否则就是整页塌了
      await expect(page.locator("main").getByText("运行中进程").first()).toBeVisible();
      await expect(page).toHaveScreenshot(`layout-${layout}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        // 只遮「更新于 12:34:56」这处时间戳；遮 main 里的 .num 会把
        // 指标数字整块涂成粉色掩码，看不出真实渲染结果。
      });
    }
  });

  test("三种外壳都保留完整导航", async ({ page }) => {
    for (const shell of SHELLS) {
      await pickShell(page, shell);
      const nav = page.locator("aside, header nav");
      const buttons = nav.locator('button[title="概览"]');
      await expect(buttons.first()).toBeVisible();
      await expect(page).toHaveScreenshot(`shell-${shell}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        // 只遮「更新于 12:34:56」这处时间戳；遮 main 里的 .num 会把
        // 指标数字整块涂成粉色掩码，看不出真实渲染结果。
      });
    }
  });

  test("关键页面在默认主题下无布局回归", async ({ page }) => {
    for (const [label, name] of [
      ["进程", "processes"],
      ["服务与端口", "servers"],
      ["成本账本", "costs"],
      ["任务", "tasks"],
    ] as const) {
      await gotoPage(page, label);
      await expect(page).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.005 });
    }
  });

  test("设置页的主题与版面板完整渲染", async ({ page }) => {
    await gotoAppearance(page);
    // 八套内置主题 + 导入/导出/复制按钮
    await expect(
      page.locator("main button[aria-label]").filter({ hasText: "" })
    ).not.toHaveCount(0);
    await expect(page.locator("button[data-layout]")).toHaveCount(7);
    await expect(page.locator("button[data-shell]")).toHaveCount(3);
    await expect(page).toHaveScreenshot("settings.png", { maxDiffPixelRatio: 0.005 });
  });

  test("窄屏下导航变抽屉且内容单列", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    const left = await page.evaluate(
      () => document.querySelector("aside")!.getBoundingClientRect().left
    );
    expect(left).toBeLessThan(0);

    await expect(page).toHaveScreenshot("mobile-overview.png", {
      maxDiffPixelRatio: 0.005,
    });
  });
});

function themeName(id: string): string {
  const map: Record<string, string> = {
    midnight: "Midnight",
    frost: "Frost",
    paper: "Paper",
    aurora: "Aurora",
    terminal: "Terminal",
    ink: "Ink",
    void: "Void",
    jade: "Jade",
  };
  return map[id] ?? id;
}

test.describe("主题结构契约", () => {
  /**
   * 纯截图不够：主题变量必须真的作用到元素上。
   * 这条能在圆角/阴影被误改时立刻失败，而不依赖像素对比。
   */
  test("每套主题的圆角与底色都来自自身 token", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);

    const measure = () =>
      page.evaluate(() => {
        const card = document.querySelector("main .t-card") as HTMLElement | null;
        const cs = getComputedStyle(document.documentElement);
        return {
          radius: card ? getComputedStyle(card).borderTopLeftRadius : "",
          bg: cs.getPropertyValue("--color-bg").trim(),
          font: cs.getPropertyValue("--font-sans").trim(),
        };
      });

    const seen = new Set<string>();
    for (const name of ["Midnight", "Frost", "Paper", "Terminal"]) {
      await pickTheme(page, name);
      const m = await measure();
      expect(m.bg).toMatch(/^#|rgb/);
      expect(m.radius).not.toBe("");
      seen.add(`${m.radius}|${m.bg}`);
    }
    // 四套主题至少产生三种不同的「圆角+底色」组合，
    // 否则说明主题没有真正作用到元素上（只换了变量名没换值）
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  test("切换自定义主题会同时换掉颜色、圆角与密度变量", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);

    const read = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return {
          bg: cs.getPropertyValue("--color-bg").trim(),
          radius: cs.getPropertyValue("--radius-card").trim(),
          space: cs.getPropertyValue("--space-card").trim(),
          font: cs.getPropertyValue("--font-sans").trim(),
        };
      });

    const before = await read();
    await pickTheme(page, "Terminal");
    const after = await read();

    expect(after.bg).not.toBe(before.bg);
    expect(after.radius).not.toBe(before.radius);
    expect(after.space).not.toBe(before.space);
    expect(after.font.toLowerCase()).toContain("mono");
  });
});

test.describe("自定义主题", () => {
  test("复制内置主题后可改色并保存，刷新后仍然生效", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);
    await gotoAppearance(page);

    // 复制当前主题（Midnight）→ 编辑器打开
    await page.locator('button:has-text("复制为新主题")').first().click();
    await page.waitForTimeout(500);

    // 改名 + 改强调色
    const nameInput = page.locator('div[role="dialog"] input').first();
    await nameInput.fill("Test Theme");
    // 四个颜色输入依次是 bg / panel / text / accent
    await page.locator('div[role="dialog"] input[type="color"]').nth(3).fill("#ff00aa");
    await page.locator('div[role="dialog"] button:has-text("保存并应用")').click();
    await page.waitForTimeout(600);

    const accentVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim()
    );
    expect(accentVar.toLowerCase()).toBe("#ff00aa");

    // 刷新后主题仍然在
    await page.reload();
    await page.waitForTimeout(1500);
    const afterReload = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim()
    );
    expect(afterReload.toLowerCase()).toBe("#ff00aa");
    // 自定义主题必须还在列表里（名字是用户起的那个）
    await gotoAppearance(page);
    await expect(page.locator('main button[aria-label="Test Theme"]')).toHaveCount(1);
  });
});

test.describe("组件摆放", () => {
  test("隐藏的组件在概览页消失，重新打开后出现", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    await expect(page.getByText("本地会话文件").first()).toBeVisible();

    await gotoAppearance(page);
    const row = page.locator("li", { hasText: "会话文件" }).first();
    await row.locator("button").last().click();
    await page.waitForTimeout(300);
    await gotoPage(page, "概览");
    await expect(page.getByText("本地会话文件").first()).toHaveCount(0);

    await gotoAppearance(page);
    await page
      .locator("li", { hasText: "会话文件" })
      .first()
      .locator("button")
      .last()
      .click();
    await page.waitForTimeout(300);
    await gotoPage(page, "概览");
    await expect(page.getByText("本地会话文件").first()).toBeVisible();
  });

  test("上移/下移改变组件顺序并持久化", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1500);
    await gotoAppearance(page);

    const rows = page.locator("main ul li");
    const firstBefore = await rows.first().innerText();
    // 第二行上移
    await rows.nth(1).locator("button").first().click();
    await page.waitForTimeout(250);
    const firstAfter = await rows.first().innerText();
    expect(firstAfter).not.toBe(firstBefore);

    await page.reload();
    await page.waitForTimeout(1500);
    await gotoAppearance(page);
    const firstReload = await page.locator("main ul li").first().innerText();
    expect(firstReload).toBe(firstAfter);
  });
});

test.describe("图标渲染", () => {
  /**
   * 品牌字形必须是「直接贴上去」的矢量笔画：侧栏与报头里都是 SVG，
   * 没有 <img>、没有底板。旧实现是白底 JPEG 抠图，深色侧栏上留下一圈
   * 白方块，而整页截图根本看不见它 —— 所以这里查 DOM 契约，
   * 并且实测 SVG 背景不是白色贴片。
   */
  test("品牌字形是矢量笔画、随主题着色", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);

    const stats = await page.evaluate(() => {
      const svg = document.querySelector("aside svg") as SVGSVGElement | null;
      if (!svg) return { error: "no brand svg" };
      return {
        paths: svg.querySelectorAll("path").length,
        hasRect: Boolean(svg.querySelector("rect")),
        hasImage: Boolean(svg.querySelector("image")),
        fill: svg.getAttribute("fill"),
        bg: getComputedStyle(document.querySelector("aside")!).backgroundColor,
      };
    });

    expect(stats.error).toBeUndefined();
    expect(stats.paths).toBe(4);
    expect(stats.hasRect).toBe(false);
    expect(stats.hasImage).toBe(false);
    expect(stats.fill).toBe("none");
    expect(stats.bg).not.toBe("rgb(255, 255, 255)");
  });

  test("品牌字形所在容器没有白色矩形贴片", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);
    const box = await page.locator("aside svg").first().boundingBox();
    expect(box).not.toBeNull();
    const shot = await page.screenshot({
      clip: {
        x: Math.round(box!.x - 6),
        y: Math.round(box!.y - 6),
        width: Math.round(box!.width + 12),
        height: Math.round(box!.height + 12),
      },
    });
    const whiteRatio = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let white = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) white++;
      }
      return white / (d.length / 4);
    }, shot.toString("base64"));
    expect(whiteRatio).toBeLessThan(0.02);
  });
});

test.describe("图表不重叠", () => {
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
