import "@testing-library/jest-dom/vitest";

// jsdom 没有 matchMedia / ResizeObserver / scrollIntoView，
// ECharts 与虚拟滚动相关组件会用到，测试环境统一打桩。
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

class RO implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!window.ResizeObserver) {
  window.ResizeObserver = RO;
}

// ECharts 内部会调用 element.animate，jsdom 缺失时兜底
if (!Element.prototype.animate) {
  Element.prototype.animate = (() =>
    ({
      cancel: () => {},
      finished: Promise.resolve(),
      addEventListener: () => {},
    }) as unknown as Animation) as typeof Element.prototype.animate;
}
